import Router from "@koa/router";
import {
  PRODUCT_RELEASE_DATE,
  PRODUCT_VERSION,
} from "../constant/productVersion.generated";

const router = new Router();

function resolveGitSha(): string {
  const raw = String(process.env.GIT_SHA ?? "").trim();
  return raw || "dev";
}

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [system]
 *     summary: 健康检查与构建溯源
 *     description: |
 *       无需鉴权。返回产品版名片（productVersion）与构建 commit（gitSha）。
 *       产品版不等于「四端均已是该号在线」；排障以 gitSha / 镜像 sha tag 为准。
 *     security: []
 *     responses:
 *       200:
 *         description: 进程存活
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok, productVersion, releaseDate, gitSha]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 productVersion:
 *                   type: string
 *                   example: "3.3.0"
 *                 releaseDate:
 *                   type: string
 *                   example: "2026-7-15"
 *                 gitSha:
 *                   type: string
 *                   description: 构建注入的 github.sha；本地未注入时为 dev
 *                 uptime:
 *                   type: number
 *                   description: 进程运行秒数
 */
router.get("/health", (ctx) => {
  ctx.status = 200;
  ctx.body = {
    ok: true,
    productVersion: PRODUCT_VERSION,
    releaseDate: PRODUCT_RELEASE_DATE,
    gitSha: resolveGitSha(),
    uptime: process.uptime(),
  };
});

export default router;
