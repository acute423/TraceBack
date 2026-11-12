import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validateQuery } from "../middleware/validate.js";
import { adminClaimsQuerySchema } from "../utils/reportValidation.js";
import {
  deactivateUser,
  getStats,
  listAdminClaims,
  listUsers,
} from "../controllers/adminController.js";

const router = express.Router();
router.use(authenticate, authorizeRoles("admin"));
router.get("/stats", getStats);
router.get("/claims", validateQuery(adminClaimsQuerySchema), listAdminClaims);
router.get("/users", listUsers);
router.patch("/users/:id/deactivate", deactivateUser);

export default router;
