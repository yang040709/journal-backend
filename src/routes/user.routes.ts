import Router from "@koa/router";
import { success, error, ErrorCodes } from "../utils/response";
import { UserService } from "../service/user.service";
import { z } from "zod";

const router = new Router({
  prefix: "/auth",
});

// 登录请求验证
const loginSchema = z.object({
  code: z.string().min(1, "登录凭证不能为空"),
});

/**
 * @route POST /auth/login
 * @desc 用户登录
 */
router.post("/login", async (ctx) => {
  try {
    const body = loginSchema.parse(ctx.request.body);
    const result = await UserService.login(body.code);
    success(ctx, result, "登录成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
    } else {
      console.error("登录失败:", err);
      error(ctx, err.message || "登录失败", ErrorCodes.INTERNAL_ERROR, 500);
    }
  }
});

export default router;
