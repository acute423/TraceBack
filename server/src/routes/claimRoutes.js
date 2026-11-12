import express from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validateBody } from "../middleware/validate.js";
import {
  adminDecision,
  createClaim,
  finderClaims,
  finderDecision,
  getClaimContact,
  myClaims,
  relayMessage,
} from "../controllers/claimController.js";
import {
  adminDecisionSchema,
  claimSchema,
  decisionSchema,
  messageSchema,
} from "../utils/reportValidation.js";

const router = express.Router();
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.post("/", validateBody(claimSchema), createClaim);
router.get("/mine", myClaims);
router.get("/finder", finderClaims);
router.post("/:id/finder-decision", validateBody(decisionSchema), finderDecision);
router.post("/:id/admin-decision", authorizeRoles("admin"), validateBody(adminDecisionSchema), adminDecision);
router.get("/:id/contact", contactLimiter, getClaimContact);
router.post("/:id/messages", contactLimiter, validateBody(messageSchema), relayMessage);

export default router;
