import Router from "@koa/router";
import { z } from "zod";
import { ErrorCodes, error, success } from "../utils/response";
import { UserReviewService } from "../service/userReview.service";

const MAX_PAGE_DEPTH = (() => {
  const raw = String(process.env.QUERY_PAGE_DEPTH_LIMIT ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : 50_000;
})();

const router = new Router({
  prefix: "/reviews",
});

const publicListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(10),
  })
  .refine((val) => val.page * val.pageSize <= MAX_PAGE_DEPTH, {
    message: `分页深度超过限制（page*pageSize <= ${MAX_PAGE_DEPTH}）`,
    path: ["page"],
  });

router.get("/", async (ctx) => {
  try {
    const query = publicListQuerySchema.parse(ctx.query);
    const data = await UserReviewService.listPublic(query);
    success(ctx, data, "ok");
  } catch (e) {
    if (e instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    error(ctx, e instanceof Error ? e.message : "加载失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
