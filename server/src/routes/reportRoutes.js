import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { reportImage } from "../middleware/uploadImage.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  createReportSchema,
  normalizeReportFields,
  reportQuerySchema,
  updateReportSchema,
} from "../utils/reportValidation.js";
import {
  closeReport,
  createReport,
  getMatches,
  getReport,
  listReports,
  updateReport,
} from "../controllers/reportController.js";

const lostRouter = express.Router();
const foundRouter = express.Router();

const registerReportRoutes = (router, type) => {
  router.get("/", validateQuery(reportQuerySchema), listReports);
  router.post("/", reportImage, normalizeReportFields(type), validateBody(createReportSchema), createReport);
  router.get("/:id/matches", getMatches);
  router.get("/:id", getReport);
  router.patch("/:id", reportImage, normalizeReportFields(type), validateBody(updateReportSchema), updateReport);
  router.post("/:id/close", closeReport);
};

foundRouter.get("/public", validateQuery(reportQuerySchema), listReports);
foundRouter.use(authenticate);
registerReportRoutes(foundRouter, "found");
lostRouter.use(authenticate);
registerReportRoutes(lostRouter, "lost");

export { lostRouter, foundRouter };
