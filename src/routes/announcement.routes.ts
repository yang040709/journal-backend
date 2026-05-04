import Router from "@koa/router";
import { z } from "zod";
import { ErrorCodes, error, paginatedSuccess, success } from "../utils/response";
import { AnnouncementService } from "../service/announcement.service";

const router = new Router({
  prefix: "/announcements",
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

router.get("/", async (ctx) => {
  try {
    const q = listQuerySchema.parse(ctx.query);
    const data = await AnnouncementService.listPublic(q);
    paginatedSuccess(ctx, data.items, data.total, data.page, data.limit, "ok");
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

router.get("/:id", async (ctx) => {
  try {
    const row = await AnnouncementService.getPublishedDetailAndIncreaseView(String(ctx.params.id || ""));
    if (!row) {
      error(ctx, "公告不存在或已下线", ErrorCodes.NOT_FOUND, 404);
      return;
    }
    success(ctx, row, "ok");
  } catch (e) {
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
