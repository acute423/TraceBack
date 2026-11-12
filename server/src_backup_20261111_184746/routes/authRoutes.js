import express from "express";
import { register, login } from "../controllers/authController.js";
import { registerSchema, loginSchema } from "../utils/authValidation.js";
import { validateBody } from "../middleware/validate.js";

const router = express.Router();

router.post("/register", validateBody(registerSchema), register);
router.post("/login", validateBody(loginSchema), login);

export default router;
