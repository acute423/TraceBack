import express from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  refreshSession,
  logout,
} from "../controllers/authController.js";

import {
  registerSchema,
  loginSchema,
} from "../utils/authValidation.js";

import { validateBody } from "../middleware/validate.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Try again later.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/register",
  registerLimiter,
  validateBody(registerSchema),
  register
);

router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  login
);

router.post("/refresh", refreshLimiter, refreshSession);
router.post("/logout", logout);

export default router;
