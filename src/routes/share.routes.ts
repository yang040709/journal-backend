import Router from "@koa/router";
import { NoteService, ShareAccessError } from "../service/note.service";
import { ShareSecurityTaskService } from "../service/shareSecurityTask.service";
import { success, error, ErrorCodes } from "../utils/response";
import {
  authMiddleware,
  optionalAuthMiddleware,
  AuthContext,
} from "../middlewares/auth.middleware";

const router = new Router({
  prefix: "/share",
});

/**
 * @openapi
 * /share/{shareId}:
 *   get:
 *     tags:
 *       - share
 *     summary: 通过 shareId 获取分享手帐
 *     description: 无需登录；可选 Bearer Token，与作者一致时返回 isOwner true
 *     security:
 *       - {}
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shareId
 *         required: true
 *         schema:
 *           type: string
 *         description: 分享 ID
 *     responses:
 *       200:
 *         description: 获取分享手帐成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessNote'
 *       404:
 *         description: 分享不存在、已关闭或手帐已删除
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:shareId", optionalAuthMiddleware, async (ctx: AuthContext) => {
  try {
    const { shareId } = ctx.params;

    if (!shareId) {
      error(ctx, "shareId不能为空");
      return;
    }

    const viewerId = ctx.user?.userId;
    const note = await NoteService.getSharedNoteForPublic(shareId, viewerId);
    success(ctx, note, "获取成功");
  } catch (err: any) {
    if (err instanceof ShareAccessError) {
      const codeMap: Record<string, number> = {
        SHARE_NOT_FOUND: ErrorCodes.SHARE_NOT_FOUND,
        SHARE_DISABLED_BY_AUTHOR: ErrorCodes.SHARE_DISABLED_BY_AUTHOR,
        SHARE_DISABLED_BY_LOCAL_RISK: ErrorCodes.SHARE_DISABLED_BY_LOCAL_RISK,
        SHARE_DISABLED_BY_WECHAT_RISK: ErrorCodes.SHARE_DISABLED_BY_WECHAT_RISK,
        SHARE_NOTE_DELETED: ErrorCodes.SHARE_NOTE_DELETED,
      };
      error(ctx, err.message, codeMap[err.code] || ErrorCodes.NOT_FOUND, 404, {
        reason: err.code,
      });
      return;
    }
    error(ctx, err.message || "服务器错误", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /share/notes/{id}/share:
 *   post:
 *     tags:
 *       - share
 *     summary: 开启或关闭手帐分享
 *     description: 切换指定手帐的分享状态，开启时进行内容安全检测
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - share
 *             properties:
 *               share:
 *                 type: boolean
 *                 description: true 开启分享，false 关闭分享
 *     responses:
 *       200:
 *         description: 分享状态更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       400:
 *         description: 参数错误或本地风控拦截
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在或无权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post("/notes/:id/share", authMiddleware, async (ctx) => {
  try {
    const { id } = ctx.params;
    const { share } = ctx.request.body as { share?: boolean };
    const userId = ctx.user!.userId;

    if (!userId) {
      error(ctx, "用户未登录", 1006, 401);
      return;
    }

    if (typeof share !== "boolean") {
      error(ctx, "share参数必须为布尔值", 1001);
      return;
    }

    const note = await NoteService.setNoteShareStatus(id, userId, share);

    if (!note) {
      error(ctx, "手帐不存在或无权访问", 1004, 404);
      return;
    }

    const risk = await ShareSecurityTaskService.getLatestRiskSummary(String(note.id));
    success(
      ctx,
      {
        id: note.id,
        isShare: note.isShare,
        shareId: note.shareId,
        title: note.title,
        riskStatus: risk.riskStatus,
        riskMessage: share ? "分享已开启" : "手帐分享已关闭",
      },
      share ? "手帐分享已开启" : "手帐分享已关闭",
    );
  } catch (err: any) {
    if (err instanceof ShareAccessError && err.code === "SHARE_LOCAL_RISK_BLOCKED") {
      error(
        ctx,
        err.message,
        ErrorCodes.SHARE_LOCAL_RISK_BLOCKED,
        400,
        { isShare: false, riskStatus: "reject_local" },
      );
      return;
    }
    error(ctx, err.message || "服务器错误", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /share/notes/shared:
 *   get:
 *     tags:
 *       - share
 *     summary: 获取用户的分享手帐列表
 *     description: 获取当前用户已开启分享的手帐列表
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取分享手帐列表成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessNoteList'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/notes/shared", authMiddleware, async (ctx: AuthContext) => {
  try {
    const userId = ctx.user?.userId;

    if (!userId) {
      error(ctx, "用户未登录", 1006, 401);
      return;
    }

    const notes = await NoteService.getSharedNotes(userId);

    success(ctx, notes, "获取成功");
  } catch (err: any) {
    error(ctx, err.message || "服务器错误", 9999, 500);
  }
});

export default router;
