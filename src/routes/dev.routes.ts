import Router from "@koa/router";
import screenshotRoutes from "./dev/screenshot.routes";

const router = new Router();
router.use(screenshotRoutes.routes()).use(screenshotRoutes.allowedMethods());

export default router;
