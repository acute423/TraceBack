import { z } from "zod";

const reportFields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(3000),
  category: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(200),
  date: z.coerce.date(),
  hiddenDetails: z.string().trim().max(2000).optional(),
  verificationQuestion: z.string().trim().max(500).optional(),
};

export const createReportSchema = z.object(reportFields);
export const updateReportSchema = z.object({
  title: reportFields.title.optional(),
  description: reportFields.description.optional(),
  category: reportFields.category.optional(),
  location: reportFields.location.optional(),
  date: reportFields.date.optional(),
  hiddenDetails: reportFields.hiddenDetails,
  verificationQuestion: reportFields.verificationQuestion,
  status: z.literal("returned").optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const claimSchema = z.object({
  lostId: z.string().regex(/^[a-f\d]{24}$/i),
  foundId: z.string().regex(/^[a-f\d]{24}$/i),
  answers: z.object({
    verificationAnswer: z.string().trim().min(1).max(1000),
  }),
});

export const decisionSchema = z.object({
  decision: z.enum(["looks_right", "not_owner", "returned_to_owner", "accepted", "rejected"]),
});

export const adminDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().trim().max(500).optional(),
});

export const messageSchema = z.object({
  message: z.string().trim().min(1).max(3000),
});

export const reportQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
});

export const adminClaimsQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
});

export const normalizeReportFields = (type) => (req, res, next) => {
  const body = { ...req.body };
  body.title ??= body.itemName;
  body.date ??= body[type === "lost" ? "lostDate" : "foundDate"];
  delete body.itemName;
  delete body.lostDate;
  delete body.foundDate;
  req.body = body;
  next();
};
