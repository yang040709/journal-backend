import Router from "@koa/router";
import { success, error, ErrorCodes } from "../../utils/response";
import { AdminAccountService } from "../../service/adminAccount.service";
import { AdminCaptchaService } from "../../service/adminCaptcha.service";
import { AdminLoginRateLimitService } from "../../service/adminLoginRateLimit.service";
import { AlertMetricService } from "../../service/alertMetric.service";
import { ServerChanNotifyService } from "../../service/serverChanNotify.service";
import { WechatMpNotifyService } from "../../service/wechatMpNotify.service";
import { adminAuthMiddleware } from "../../middlewares/adminAuth.middleware";
import { isAdminLoginCaptchaEnabled } from "../../config/adminLoginEnv";
import {
  isAdminLoginSecurityError,
  AdminCaptchaError,
} from "../../errors/adminLogin.errors";
import { loginSchema } from "./admin.schemas";
import adminCoreRoutes from "./admin.core.routes";
import adminNoteTagsRoutes from "./admin.noteTags.routes";
import adminAiStylesRoutes from "./admin.aiStyles.routes";
import adminNotesRoutes from "./admin.notes.routes";
import adminNotebooksRoutes from "./admin.notebooks.routes";
import adminTemplatesRoutes from "./admin.templates.routes";
import adminRemindersRoutes from "./admin.reminders.routes";
import adminUsersRoutes from "./admin.users.routes";
import adminGalleryRoutes from "./admin.gallery.routes";
import adminUsersExtraRoutes from "./admin.usersExtra.routes";
import adminPointsRoutes from "./admin.points.routes";
import adminAnnouncementsRoutes from "./admin.announcements.routes";
import adminFeedbacksRoutes from "./admin.feedbacks.routes";

const router = new Router({ prefix: "/admin" });

/**
 * @openapi
 * tags:
 *   - name: adminCore
 *     description: 后台核心（auth、stats、alerts、系统配置）
 *   - name: adminNotes
 *     description: 手帐管理
 *   - name: adminNotebooks
 *     description: 手帐本管理
 *   - name: adminUsers
 *     description: 用户管理
 *   - name: adminTemplates
 *     description: 模板管理
 *   - name: adminReminders
 *     description: 提醒管理
 *   - name: adminNoteTags
 *     description: 手帐标签
 *   - name: adminAiStyles
 *     description: AI 风格
 *   - name: adminGallery
 *     description: 图库
 *   - name: adminFeedbacks
 *     description: 反馈管理
 *   - name: adminAnnouncements
 *     description: 公告管理
 *   - name: adminPoints
 *     description: 积分活动
 *   - name: adminReviews
 *     description: 用户评价
 */

/**
 * @openapi
 * /admin/auth/captcha:
 *   get:
 *     tags: [adminCore]
 *     summary: 获取登录图形验证码
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer }
 *                 data:
 *                   type: object
 *                   properties:
 *                     captchaId: { type: string }
 *                     imageBase64: { type: string }
 *                     expiresIn: { type: integer }
 *       '429':
 *         description: 请求过于频繁
 *     security: []
 */
router.get("/auth/captcha", async (ctx) => {
  const clientKey = ctx.ip || ctx.request.ip || "unknown";
  try {
    const data = await AdminCaptchaService.createChallenge(clientKey);
    success(ctx, data);
  } catch (e) {
    if (isAdminLoginSecurityError(e)) {
      error(ctx, e.message, e.code, 429);
      return;
    }
    error(ctx, "验证码生成失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /admin/auth/login:
 *   post:
 *     tags: [adminCore]
 *     summary: 管理员登录
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               captchaId: { type: string }
 *               captchaCode: { type: string }
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessAdminLogin'
 *       '400':
 *         description: 参数或凭证错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '429':
 *         description: 登录过于频繁或账号已锁定
 *     security: []
 */
router.post("/auth/login", async (ctx) => {
  const clientKey = ctx.ip || ctx.request.ip || "unknown";
  let username = "unknown";
  let recordPasswordFailure = false;
  try {
    const body = loginSchema.parse(ctx.request.body);
    username = body.username;

    await AdminLoginRateLimitService.assertNotLocked(body.username);
    AdminLoginRateLimitService.consumeIpLimit(clientKey);
    AdminLoginRateLimitService.consumeUsernameLimit(body.username);

    if (isAdminLoginCaptchaEnabled()) {
      if (!body.captchaId?.trim() || !body.captchaCode?.trim()) {
        throw new AdminCaptchaError("请填写验证码");
      }
      await AdminCaptchaService.verifyAndConsume(body.captchaId, body.captchaCode);
    }

    recordPasswordFailure = true;
    const result = await AdminAccountService.login(body.username, body.password);
    await AdminLoginRateLimitService.clearFailStreak(body.username);

    void AlertMetricService.recordOperation("login_admin", { success: true });
    void WechatMpNotifyService.notifyAdminLogin({
      username: body.username,
      ip: clientKey,
    });
    void ServerChanNotifyService.notifyAdminLogin({
      username: body.username,
      ip: clientKey,
    });
    success(ctx, result);
  } catch (e) {
    if (e instanceof AdminCaptchaError) {
      error(ctx, e.message, e.code, 400);
      return;
    }
    if (isAdminLoginSecurityError(e)) {
      error(ctx, e.message, e.code, 429);
      return;
    }

    if (recordPasswordFailure && username !== "unknown") {
      await AdminLoginRateLimitService.recordPasswordFail(username);
      void (async () => {
        await AlertMetricService.recordOperation("login_admin", { success: false });
        await WechatMpNotifyService.maybeNotifyAdminLoginFailBurst({
          username,
          ip: clientKey,
        });
      })();
    }

    const msg = e instanceof Error ? e.message : "登录失败";
    error(ctx, msg, ErrorCodes.USER_CREDENTIALS_ERROR, 400);
  }
});

const authed = new Router();
authed.use(adminAuthMiddleware);
authed.use(adminCoreRoutes.routes());
authed.use(adminNoteTagsRoutes.routes());
authed.use(adminAiStylesRoutes.routes());
authed.use(adminNotesRoutes.routes());
authed.use(adminNotebooksRoutes.routes());
authed.use(adminTemplatesRoutes.routes());
authed.use(adminRemindersRoutes.routes());
authed.use(adminUsersRoutes.routes());
authed.use(adminGalleryRoutes.routes());
authed.use(adminUsersExtraRoutes.routes());
authed.use(adminPointsRoutes.routes());
authed.use(adminAnnouncementsRoutes.routes());
authed.use(adminFeedbacksRoutes.routes());

router.use(authed.routes()).use(authed.allowedMethods());

export default router;
