import Router from "@koa/router";
import { z } from "zod";
import { authMiddleware, type AuthContext } from "../middlewares/auth.middleware";
import { MAX_EVENTS_PER_REQUEST } from "../constant/clientEvent";
import { ClientEventService } from "../service/clientEvent.service";
import { ClientEventConfigService } from "../service/clientEventConfig.service";
import { ErrorCodes, error, success } from "../utils/response";
import logger from "../utils/logger";

const router = new Router({
  prefix: "/events",
});

const clientEventItemSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  eventName: z.string().trim().min(1).max(64),
  clientTs: z.number().finite(),
  platform: z.string().trim().min(1).max(32),
  pagePath: z.string().trim().min(1).max(256),
  appVersion: z.string().trim().max(64).optional(),
  sessionId: z.string().trim().max(128).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const ingestEventsSchema = z.object({
  events: z.array(clientEventItemSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

router.use(authMiddleware);

/**
 * @openapi
 * /events/config:
 *   get:
 *     tags:
 *       - events
 *     summary: 获取客户端埋点开关配置
 *     description: 需登录；返回总开关与各 eventName 开关
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *       401:
 *         description: 未登录
 */
router.get("/config", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user?.userId;
    if (!userId) {
      error(ctx, "认证失败", ErrorCodes.AUTH_ERROR, 401);
      return;
    }

    const data = await ClientEventConfigService.getForClient();
    success(ctx, data, "ok");
  } catch (e) {
    logger.error("[events] get config failed", e);
    error(
      ctx,
      e instanceof Error ? e.message : "获取配置失败",
      ErrorCodes.INTERNAL_ERROR,
      500,
    );
  }
});

/**
 * @openapi
 * /events:
 *   post:
 *     tags:
 *       - events
 *     summary: 批量上报客户端点击埋点
 *     description: 需登录；单批最多 20 条；重复 eventId 幂等跳过
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [events]
 *             properties:
 *               events:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   required: [eventId, eventName, clientTs, platform, pagePath]
 *                   properties:
 *                     eventId:
 *                       type: string
 *                     eventName:
 *                       type: string
 *                     clientTs:
 *                       type: number
 *                     platform:
 *                       type: string
 *                     pagePath:
 *                       type: string
 *                     appVersion:
 *                       type: string
 *                     sessionId:
 *                       type: string
 *                     props:
 *                       type: object
 *     responses:
 *       200:
 *         description: 上报成功（部分条目可能被 rejected 或 duplicated）
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未登录
 *       500:
 *         description: 服务器内部错误
 */
router.post("/", async (ctx: AuthContext) => {
  try {
    const parsed = ingestEventsSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      error(ctx, "参数错误", ErrorCodes.PARAM_ERROR, 400);
      return;
    }

    const userId = ctx.user?.userId;
    if (!userId) {
      error(ctx, "认证失败", ErrorCodes.AUTH_ERROR, 401);
      return;
    }

    const requestId = String(ctx.state?.requestId || "unknown");
    const data = await ClientEventService.ingestBatch({
      userId,
      requestId,
      events: parsed.data.events,
      ip: ctx.ip,
      userAgent: String(ctx.headers["user-agent"] || ""),
    });

    success(ctx, data, "ok");
  } catch (e) {
    logger.error("[events] ingest failed", e);
    error(
      ctx,
      e instanceof Error ? e.message : "上报失败",
      ErrorCodes.INTERNAL_ERROR,
      500,
    );
  }
});

export default router;
