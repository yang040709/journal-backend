import Router from "@koa/router";
import { NoteService } from "../service/note.service";
import { success, error } from "../utils/response";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = new Router({
  prefix: "/share",
});

/**
 * @route GET /share/:shareId
 * @desc 通过shareId获取分享的手帐（无需鉴权）
 * @access Public
 */
router.get("/:shareId", async (ctx) => {
  try {
    const { shareId } = ctx.params;

    if (!shareId) {
      error(ctx, "shareId不能为空");
      return;
    }

    const note = await NoteService.getNoteByShareId(shareId);

    if (!note) {
      error(ctx, "手帐不存在或未分享或被关闭分享", 1004, 404);
      return;
    }

    success(ctx, note, "获取成功");
  } catch (err: any) {
    error(ctx, err.message || "服务器错误", 9999, 500);
  }
});

/**
 * @route POST /notes/:id/share
 * @desc 开启或关闭手帐分享
 * @access Private
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

    success(
      ctx,
      {
        id: note.id,
        isShare: note.isShare,
        shareId: note.shareId,
        title: note.title,
      },
      share ? "手帐分享已开启" : "手帐分享已关闭",
    );
  } catch (err: any) {
    error(ctx, err.message || "服务器错误", 9999, 500);
  }
});

/**
 * @route GET /notes/shared
 * @desc 获取用户的分享手帐列表
 * @access Private
 */
router.get("/notes/shared", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user?.id;

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
