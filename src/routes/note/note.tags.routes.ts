import Router from "@koa/router";
import { z } from "zod";
import { AuthContext } from "../../middlewares/auth.middleware";
import { success, error, ErrorCodes } from "../../utils/response";
import { NotePresetTagService } from "../../service/notePresetTag.service";
import { UserNoteCustomTagService } from "../../service/userNoteCustomTag.service";
import logger from "../../utils/logger";
import { filterTagsByKeyword } from "./note.shared";
import {
  addCustomTagSchema,
  deleteCustomTagQuerySchema,
  presetTagsQuerySchema,
} from "./note.schemas";

const router = new Router();

/**
 * @openapi
 * /notes/preset-tags:
 *   get:
 *     tags: [note]
 *     summary: 获取可选标签（系统预设 + 当前用户自定义）
 *     description: data.tags 为合并去重后的可选列表；data.systemTags、data.customTags 分区展示用
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: 标签关键字（按包含关系过滤，忽略大小写）
 *     responses:
 *       200:
 *         description: 成功
 */
/**
 * 获取可选标签：系统预设 + 当前用户自定义合并为 tags；可通过 q 关键字过滤
 */
router.get("/preset-tags", async (ctx: AuthContext) => {
  try {
    const query = presetTagsQuerySchema.parse(ctx.query);
    const userId = ctx.user!.userId;
    const systemTags = await NotePresetTagService.getTagNames();
    const customTags = await UserNoteCustomTagService.list(userId);
    const tags = filterTagsByKeyword(
      UserNoteCustomTagService.mergeSelectableTags(systemTags, customTags),
      query.q,
    );
    success(
      ctx,
      {
        tags,
        systemTags: filterTagsByKeyword(systemTags, query.q),
        customTags: filterTagsByKeyword(customTags, query.q),
      },
      "获取预设标签成功",
    );
  } catch (err) {
    logger.error("获取预设标签失败:", err);
    error(ctx, "获取预设标签失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/custom-tags:
 *   post:
 *     tags: [note]
 *     summary: 新增自定义标签
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: 成功；data 含 customTags、tags（合并）
 */
/**
 * 新增自定义标签（最多 12 个，且不可与系统预设同名）
 */
router.post("/custom-tags", async (ctx: AuthContext) => {
  try {
    const body = addCustomTagSchema.parse(ctx.request.body);
    const userId = ctx.user!.userId;
    const customTags = await UserNoteCustomTagService.add(userId, body.name);
    const systemTags = await NotePresetTagService.getTagNames();
    const tags = UserNoteCustomTagService.mergeSelectableTags(
      systemTags,
      customTags,
    );
    success(ctx, { customTags, tags }, "添加自定义标签成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const msg = err instanceof Error ? err.message : "添加失败";
    logger.error("添加自定义标签失败:", err);
    error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
  }
});

/**
 * @openapi
 * /notes/custom-tags:
 *   delete:
 *     tags: [note]
 *     summary: 删除自定义标签
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: 标签名称
 *     responses:
 *       200:
 *         description: 成功；data 含 customTags、tags（合并）
 */
/**
 * 删除自定义标签（query: name=标签名）
 */
router.delete("/custom-tags", async (ctx: AuthContext) => {
  try {
    const q = deleteCustomTagQuerySchema.parse({
      name:
        typeof ctx.query.name === "string"
          ? ctx.query.name
          : Array.isArray(ctx.query.name)
            ? ctx.query.name[0]
            : "",
    });
    const userId = ctx.user!.userId;
    const customTags = await UserNoteCustomTagService.remove(userId, q.name);
    const systemTags = await NotePresetTagService.getTagNames();
    const tags = UserNoteCustomTagService.mergeSelectableTags(
      systemTags,
      customTags,
    );
    success(ctx, { customTags, tags }, "删除自定义标签成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    const msg = err instanceof Error ? err.message : "删除失败";
    logger.error("删除自定义标签失败:", err);
    error(ctx, msg, ErrorCodes.PARAM_ERROR, 400);
  }
});

export default router;
