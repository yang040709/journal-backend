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
import { calendarDailyCountsSchema, onThisDaySchema } from "./note.schemas";
import { getDateKeyByTimezone } from "../../utils/dateKey";

const router = new Router();

/**
 * @openapi
 * /notes/on-this-day:
 *   get:
 *     tags: [note]
 *     summary: 时光回顾（历史上的今天）
 *     description: 按用户时区对 createdAt 的月-日匹配，跨年聚合手帐列表（不含 content）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: 月，默认当前时区当天
 *       - in: query
 *         name: day
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 31
 *         description: 日，默认当前时区当天
 *       - in: query
 *         name: tz
 *         schema:
 *           type: string
 *           default: Asia/Shanghai
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: 成功；data 含 total、totalMatched、truncated
 */
/** GET /notes/on-this-day — 按「月-日」跨年聚合手帐（createdAt，未删除） */
router.get("/on-this-day", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const q = onThisDaySchema.parse(ctx.query);
    const tz = q.tz.trim() || "Asia/Shanghai";
    const dateKey = getDateKeyByTimezone(tz);
    const parts = dateKey.split("-").map((v) => Number(v));
    const defaultMonth = parts[1] || new Date().getMonth() + 1;
    const defaultDay = parts[2] || new Date().getDate();
    const month = q.month ?? defaultMonth;
    const day = q.day ?? defaultDay;
    const data = await NoteService.getNotesOnThisDay(
      userId,
      month,
      day,
      tz,
      q.limit,
    );
    success(ctx, data, "获取时光回顾成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof Error && err.message) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    logger.error("获取时光回顾失败:", err);
    error(ctx, "获取时光回顾失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

/**
 * @openapi
 * /notes/calendar/daily-counts:
 *   get:
 *     tags: [note]
 *     summary: 获取日历热力图按日统计
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startTime
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: endTime
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: tz
 *         schema:
 *           type: string
 *           default: Asia/Shanghai
 *     responses:
 *       '200':
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessObject'
 *       '401':
 *         description: 未授权
 */
router.get("/calendar/daily-counts", async (ctx: AuthContext) => {
  try {
    const userId = ctx.user!.userId;
    const q = calendarDailyCountsSchema.parse(ctx.query);
    const data = await NoteService.getCalendarDailyCounts(
      userId,
      q.startTime,
      q.endTime,
      q.tz,
    );
    success(ctx, data, "获取日历统计成功");
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(ctx, "参数验证失败", ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    if (err instanceof Error && err.message) {
      error(ctx, err.message, ErrorCodes.PARAM_ERROR, 400);
      return;
    }
    logger.error("获取日历统计失败:", err);
    error(ctx, "获取日历统计失败", ErrorCodes.INTERNAL_ERROR, 500);
  }
});

export default router;
