import Router from "@koa/router";
import { authMiddleware } from "../../middlewares/auth.middleware";
import noteTagsRoutes from "./note.tags.routes";
import noteExportRoutes from "./note.export.routes";
import noteAiRoutes from "./note.ai.routes";
import noteInsightsRoutes from "./note.insights.routes";
import noteSearchRoutes from "./note.search.routes";
import noteTrashRoutes from "./note.trash.routes";
import noteCrudRoutes from "./note.crud.routes";
import noteShareRoutes from "./note.share.routes";

const router = new Router({ prefix: "/notes" });

router.use(authMiddleware);
// Static paths before /:id
router.use(noteTagsRoutes.routes());
router.use(noteExportRoutes.routes());
router.use(noteAiRoutes.routes());
router.use(noteInsightsRoutes.routes());
router.use(noteSearchRoutes.routes());
router.use(noteTrashRoutes.routes());
router.use(noteCrudRoutes.routes());
router.use(noteShareRoutes.routes());

export default router;
