import Router from "@koa/router";
import { z } from "zod";
import { AuthContext } from "../../middlewares/auth.middleware";
import {
  success,
  error,
  paginatedSuccess,
  ErrorCodes,
} from "../../utils/response";
import { NoteService, NotePinLimitExceededError } from "../../service/note.service";
import logger from "../../utils/logger";
import { isGuardrailError } from "./note.shared";
import { ShareSecurityTaskService } from "../../service/shareSecurityTask.service";

const router = new Router();

/**
 * @openapi
 * /notes/{id}/share-info:
 *   get:
 *     tags: [note]
 *     summary: 获取手帐的分享信息
 *     description: 获取手帐的分享状态、分享ID和分享链接等信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 手帐ID
 *     responses:
 *       200:
 *         description: 获取分享信息成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: 手帐ID
 *                 isShare:
 *                   type: boolean
 *                   description: 是否已分享
 *                 shareId:
 *                   type: string
 *                   description: 分享ID（如果已分享）
 *                 title:
 *                   type: string
 *                   description: 手帐标题
 *                 shareUrl:
 *                   type: string
 *                   nullable: true
 *                   description: 分享链接（如果已分享）
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 手帐不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/:id/share-info", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const { id } = ctx.params;

    const note = await NoteService.getNoteById(id, userId);
    if (!note) {
      error(ctx, "手帐不存在", ErrorCodes.NOTE_NOT_FOUND, 404);
      return;
    }

    success(
      ctx,
      {
        id: note.id,
        isShare: note.isShare,
        shareId: note.shareId,
        title: note.title,
        shareUrl: note.shareId
          ? `/share/pages/share-note/share-note?share_id=${note.shareId}`
          : null,
        ...(await ShareSecurityTaskService.getLatestRiskSummary(note.id)),
      },
      "获取分享信息成功",
    );
  } catch (err) {
    logger.error("获取分享信息失败:", err);
    error(ctx, "获取分享信息失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
