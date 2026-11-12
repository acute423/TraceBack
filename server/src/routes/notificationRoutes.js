import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  listNotifications,
  markNotificationRead,
} from "../controllers/notificationController.js";

const router = express.Router();
router.use(authenticate);
router.get("/", listNotifications);
router.patch("/:id/read", markNotificationRead);

export default router;
