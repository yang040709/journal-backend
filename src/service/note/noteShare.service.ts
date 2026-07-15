import Note, { INote, LeanNote } from "../../model/Note";
import { ActivityLogger } from "../../utils/ActivityLogger";
import { toLeanNote } from "../../utils/typeUtils";
import {
  queueContentPreviewBackfill,
  toLeanNoteListItems,
} from "../../utils/noteListItem";
import { checkNoteContent } from "../../utils/sensitive-encrypted";
import { nanoid } from "nanoid";
import { ShareSecurityTaskService } from "../shareSecurityTask.service";
import {
  SharedNoteView,
  ShareAccessError,
  toSharedNoteView,
  isLikelyWeChatOpenId,
} from "./note.shared";

export class NoteShareService {
  /**
   * 通过 shareId 获取分享页展示数据（不含 userId；isOwner 依赖可选登录）
   */
  static async getSharedNoteForPublic(
    shareId: string,
    viewerUserId?: string | null,
  ): Promise<SharedNoteView | null> {
    const raw = await Note.findOne({ shareId }).lean();
    if (!raw) {
      throw new ShareAccessError("SHARE_NOT_FOUND", "分享链接不存在或已失效");
    }
    const note = toLeanNote(raw);
    if (note.isDeleted) {
      throw new ShareAccessError("SHARE_NOTE_DELETED", "该手帐已删除，暂时无法查看");
    }
    if (!note.isShare) {
      const risk = await ShareSecurityTaskService.getLatestRiskSummary(note.id);
      if (risk.riskStatus === "reject_local") {
        throw new ShareAccessError("SHARE_DISABLED_BY_LOCAL_RISK", "该手帐因内容风险已关闭分享");
      }
      if (risk.riskStatus === "reject_wechat") {
        throw new ShareAccessError(
          "SHARE_DISABLED_BY_WECHAT_RISK",
          "该手帐因微信图文风控检测结果已关闭分享",
        );
      }
      throw new ShareAccessError("SHARE_DISABLED_BY_AUTHOR", "该手帐已被作者关闭分享");
    }
    return toSharedNoteView(note, viewerUserId);
  }

  /**
   * 设置手帐分享状态
   * @param noteId 手帐ID
   * @param userId 用户ID
   * @param share 是否分享
   * @returns 更新后的手帐信息，如果手帐不存在则返回null
   */
  static async setNoteShareStatus(
    noteId: string,
    userId: string,
    share: boolean,
  ): Promise<INote | null> {
    const note = await Note.findOne({ _id: noteId, userId, isDeleted: { $ne: true } });
    if (!note) {
      return null;
    }

    // 生成shareId（如果还没有）
    if (!note.shareId) {
      note.shareId = nanoid(12); // 生成12位的唯一ID
    }

    if (share) {
      const checkResult = checkNoteContent(note.title, note.content);
      if (checkResult.hasAnySensitive) {
        note.isShare = false;
        await note.save({ timestamps: false });
        await ShareSecurityTaskService.recordLocalReject({
          noteId: String(note.id),
          userId,
          shareVersion: Number(note.shareVersion || 0),
          reason: "LOCAL_SENSITIVE_WORD",
          title: note.title,
          content: note.content,
          tags: note.tags || [],
          images: (note.images || []).map((image) => ({
            key: image.key,
            url: image.url,
            thumbUrl: image.thumbUrl,
          })),
        });
        throw new ShareAccessError(
          "SHARE_LOCAL_RISK_BLOCKED",
          "内容包含违规敏感信息，当前手帐分享已关闭",
        );
      }
      note.isShare = true;
      note.shareVersion = Number(note.shareVersion || 0) + 1;
      if (!note.firstSharedAt) note.firstSharedAt = new Date();
      await note.save({ timestamps: false });
      // 仅在 userId 是微信 openid 时提交微信风控队列，避免非微信端账号误判。
      if (isLikelyWeChatOpenId(userId)) {
        await ShareSecurityTaskService.enqueueWeChatChecks({
          noteId: String(note.id),
          userId,
          shareVersion: note.shareVersion,
          title: note.title,
          content: note.content,
          tags: note.tags || [],
          images: (note.images || []).map((image) => ({
            key: image.key,
            url: image.url,
            thumbUrl: image.thumbUrl,
          })),
        });
      }
    } else {
      // 关闭分享
      note.isShare = false;
      // 注意：不删除shareId，以便重新开启时使用同一个分享链接
      await note.save({ timestamps: false }); // 不更新updatedAt
    }

    // 记录活动
    void ActivityLogger.record(
      {
        type: share ? "share_enable" : "share_disable",
        target: "note",
        targetId: note.id,
        title: share
          ? `开启手帐分享：${note.title}`
          : `关闭手帐分享：${note.title}`,
        userId,
      },
      { blocking: false },
    );

    return note;
  }

  /**
   * 生成唯一的shareId
   * @returns 唯一的shareId
   */
  static generateShareId(): string {
    return nanoid(12);
  }

  /**
   * 获取用户的分享手帐列表
   * @param userId 用户ID
   * @returns 分享的手帐列表
   */
  static async getSharedNotes(userId: string): Promise<LeanNote[]> {
    const notes = await Note.find({
      userId,
      isShare: true,
      isDeleted: { $ne: true },
    })
      .sort({ updatedAt: -1 })
      .lean();

    queueContentPreviewBackfill(notes);
    return toLeanNoteListItems(notes);
  }
}
