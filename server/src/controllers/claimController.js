import mongoose from "mongoose";
import nodemailer from "nodemailer";
import Claim from "../models/Claim.js";
import ContactLog from "../models/ContactLog.js";
import Notification from "../models/Notification.js";
import Report from "../models/Report.js";
import User from "../models/User.js";
import { CONTACT_VERIFICATION_THRESHOLD } from "../config/matching.js";
import {
  compareEmbeddings,
  compareReports,
  createTextEmbedding,
} from "../services/matchingService.js";

const userFields = "name role isActive";
const contactFields = `${userFields} email phone`;
const claimPopulate = (admin = false) => [
  {
    path: "lostReport",
    select: `${admin ? "+hiddenDetails " : ""}type owner title itemName description category location date photos imageUrl status verificationQuestion`,
  },
  { path: "foundReport", select: "type owner title itemName description category location date photos imageUrl status" },
  { path: "claimant", select: userFields },
  { path: "finder", select: userFields },
];

const publicReport = (report, admin = false) => {
  if (!report) return null;
  const value = report.toObject ? report.toObject() : { ...report };
  delete value.imageEmbedding;
  delete value.photoEmbeddings;
  delete value.textEmbedding;
  delete value.hiddenDetailsEmbedding;
  delete value.matches;
  if (!admin) delete value.owner;
  if (!admin) delete value.hiddenDetails;
  value.itemName = value.itemName || value.title;
  value.photos = value.photos?.length ? value.photos : value.imageUrl ? [value.imageUrl] : [];
  if (value.type === "lost") value.lostDate = value.date;
  if (value.type === "found") value.foundDate = value.date;
  return value;
};

const claimResponse = (claim, admin = false, viewer = "claimant") => {
  const value = claim.toObject ? claim.toObject() : { ...claim };
  value.lostReport = publicReport(value.lostReport, admin);
  value.foundReport = publicReport(value.foundReport);
  value.lostItem = value.lostReport;
  value.foundItem = value.foundReport;
  value.lost = value.lostReport;
  value.found = value.foundReport;
  value.item = value.foundReport;
  value.report = value.foundReport;
  value.itemName = value.foundReport?.itemName || value.lostReport?.itemName || "Item claim";
  const finderAccepted = ["looks_right", "returned_to_owner"].includes(value.finderDecision);
  value.contactEligible = !admin
    && value.status !== "rejected"
    && (viewer === "finder"
      ? finderAccepted
      : value.verificationScore >= CONTACT_VERIFICATION_THRESHOLD || finderAccepted);
  return value;
};

const notify = async (user, type, message, report, claim) =>
  Notification.create({ user, type, message, report, claim });

const activeUser = async (id) => User.findOne({ _id: id, isActive: true }).select(contactFields);

export const verificationScore = async (answer, hiddenDetails, hiddenDetailsEmbedding) => {
  const actual = String(answer || "").trim();
  const expected = String(hiddenDetails || "").trim();
  if (!actual || !expected) return { score: 0, status: "not_configured" };
  const [answerEmbedding, expectedEmbedding] = await Promise.all([
    createTextEmbedding(actual),
    hiddenDetailsEmbedding?.length
      ? hiddenDetailsEmbedding
      : createTextEmbedding(expected),
  ]);
  const comparison = await compareEmbeddings(answerEmbedding, expectedEmbedding);
  return { score: comparison.score, status: "verified", degraded: comparison.degraded };
};

const updatePairStatus = async (lostReport, foundReport, status) => {
  const ids = [lostReport._id, foundReport._id];
  const result = await Report.updateMany(
    { _id: { $in: ids }, status: "pending_claim" },
    { $set: { status, resolvedAt: status === "resolved" ? new Date() : null } }
  );
  if (result.modifiedCount !== 2) {
    await Report.updateMany(
      { _id: { $in: ids }, status },
      { $set: { status: "pending_claim", resolvedAt: null } }
    );
    const error = new Error("Claim reports are no longer awaiting a decision");
    error.statusCode = 409;
    throw error;
  }
};

export const createClaim = async (req, res, next) => {
  let lockedLostId;
  let claimCreated = false;
  try {
    const [lostReport, foundReport] = await Promise.all([
      Report.findOne({ _id: req.body.lostId, type: "lost" })
        .select("+hiddenDetails +matches +textEmbedding +photoEmbeddings +imageEmbedding"),
      Report.findOne({ _id: req.body.foundId, type: "found" })
        .select("+hiddenDetails +hiddenDetailsEmbedding +matches +textEmbedding +photoEmbeddings +imageEmbedding"),
    ]);
    if (!lostReport || !foundReport) {
      return res.status(404).json({ success: false, message: "Lost or found report not found" });
    }
    if (lostReport.owner.toString() !== req.auth.userId) {
      return res.status(403).json({ success: false, message: "You must own the lost report to claim this item" });
    }
    if (foundReport.owner.toString() === req.auth.userId) {
      return res.status(400).json({ success: false, message: "You cannot claim your own found report" });
    }
    if (lostReport.status !== "active" || foundReport.status !== "active") {
      return res.status(409).json({ success: false, message: "Both reports must be active to submit a claim" });
    }
    const previous = await Claim.findOne({
      lostReport: lostReport._id,
      foundReport: foundReport._id,
      claimant: req.auth.userId,
    });
    if (previous) return res.status(409).json({ success: false, message: "You already submitted this claim" });

    const match = await compareReports(lostReport, foundReport);
    if (!foundReport.hiddenDetailsEmbedding?.length) {
      foundReport.hiddenDetailsEmbedding = await createTextEmbedding(foundReport.hiddenDetails);
      await foundReport.save();
    }
    const verified = await verificationScore(
      req.body.answers.verificationAnswer,
      foundReport.hiddenDetails,
      foundReport.hiddenDetailsEmbedding
    );
    const lockedLost = await Report.findOneAndUpdate(
      { _id: lostReport._id, owner: req.auth.userId, status: "active" },
      { $set: { status: "pending_claim" } },
      { new: true }
    );
    if (!lockedLost) return res.status(409).json({ success: false, message: "Lost report is no longer active" });
    lockedLostId = lockedLost._id;
    const lockedFound = await Report.findOneAndUpdate(
      { _id: foundReport._id, status: "active" },
      { $set: { status: "pending_claim" } },
      { new: true }
    );
    if (!lockedFound) {
      await Report.updateOne(
        { _id: lockedLostId, status: "pending_claim" },
        { $set: { status: "active", resolvedAt: null } }
      );
      return res.status(409).json({ success: false, message: "Found report is no longer active" });
    }

    let claim;
    try {
      claim = await Claim.create({
        lostReport: lostReport._id,
        foundReport: foundReport._id,
        claimant: req.auth.userId,
        finder: foundReport.owner,
        answers: req.body.answers,
        verificationScore: verified.score,
        verificationStatus: verified.status,
        matchScore: match.available ? match.score : 0,
        breakdown: match.breakdown,
        matchingStatus: !match.available ? "unavailable" : match.degraded ? "degraded" : "ready",
      });
      claimCreated = true;
    } catch (error) {
      await Report.updateMany(
        { _id: { $in: [lostReport._id, foundReport._id] }, status: "pending_claim" },
        { $set: { status: "active", resolvedAt: null } }
      );
      throw error;
    }
    try {
      await notify(foundReport.owner, "claim", "A new claim was submitted for your found item.", foundReport._id, claim._id);
    } catch (notificationError) {
      console.error("Could not create claim notification:", notificationError.message);
    }
    const populated = await Claim.findById(claim._id).populate(claimPopulate());
    res.status(201).json({ success: true, claim: claimResponse(populated) });
  } catch (error) {
    if (lockedLostId && !claimCreated) {
      try {
        await Report.updateOne(
          { _id: lockedLostId, status: "pending_claim" },
          { $set: { status: "active", resolvedAt: null } }
        );
      } catch (cleanupError) {
        console.error("Could not release the lost report after claim creation failed:", cleanupError.message);
      }
    }
    next(error);
  }
};

export const myClaims = async (req, res, next) => {
  try {
    const claims = await Claim.find({ claimant: req.auth.userId })
      .populate(claimPopulate())
      .sort({ createdAt: -1 });
    res.json({ success: true, claims: claims.map((claim) => claimResponse(claim, false, "claimant")) });
  } catch (error) {
    next(error);
  }
};

export const finderClaims = async (req, res, next) => {
  try {
    const claims = await Claim.find({ finder: req.auth.userId })
      .populate(claimPopulate())
      .sort({ createdAt: -1 });
    res.json({ success: true, claims: claims.map((claim) => claimResponse(claim, false, "finder")) });
  } catch (error) {
    next(error);
  }
};

export const finderDecision = async (req, res, next) => {
  try {
    const claim = await Claim.findById(req.params.id).populate(claimPopulate());
    if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
    if (claim.finder._id.toString() !== req.auth.userId) {
      return res.status(403).json({ success: false, message: "Only the finder can review this claim" });
    }
    if (claim.status !== "pending" || claim.adminDecision !== "pending") {
      return res.status(409).json({ success: false, message: "This claim is no longer pending" });
    }
    if (claim.finderDecisionAt) {
      return res.status(409).json({ success: false, message: "This claim has already been reviewed" });
    }
    const decisionMap = {
      looks_right: "looks_right",
      accepted: "looks_right",
      not_owner: "not_owner",
      rejected: "not_owner",
      returned_to_owner: "returned_to_owner",
    };
    claim.finderDecision = decisionMap[req.body.decision];
    claim.finderDecisionAt = new Date();
    if (claim.finderDecision === "not_owner") {
      claim.status = "rejected";
      claim.resolvedAt = new Date();
      await updatePairStatus(claim.lostReport, claim.foundReport, "active");
    }
    await claim.save();
    await notify(
      claim.claimant._id,
      "claim_finder_review",
      claim.finderDecision === "not_owner"
        ? "The finder declined your claim. The reports are active again."
        : `The finder reviewed your claim: ${claim.finderDecision.replaceAll("_", " ")}. It is awaiting administrator approval.`,
      claim.foundReport._id,
      claim._id
    );
    res.json({ success: true, claim: claimResponse(claim, false, "finder") });
  } catch (error) {
    next(error);
  }
};

export const adminDecision = async (req, res, next) => {
  try {
    const claim = await Claim.findById(req.params.id).populate(claimPopulate(true));
    if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
    if (claim.status !== "pending" || claim.adminDecision !== "pending") {
      return res.status(409).json({ success: false, message: "This claim has already received an administrator decision" });
    }
    if (!claim.finderDecision) {
      return res.status(409).json({ success: false, message: "The finder must review the claim before administrator approval" });
    }
    const approved = req.body.decision === "approved";
    await updatePairStatus(
      claim.lostReport,
      claim.foundReport,
      approved ? "resolved" : "active"
    );
    claim.status = approved ? "accepted" : "rejected";
    claim.adminDecision = req.body.decision;
    claim.adminDecisionAt = new Date();
    claim.adminDecisionBy = req.auth.userId;
    claim.adminNote = req.body.adminNote || "";
    claim.resolvedAt = new Date();
    await claim.save();
    await notify(claim.claimant._id, "admin_claim_decision", `An administrator ${req.body.decision} your claim.`, claim.foundReport._id, claim._id);
    await notify(claim.finder._id, "admin_claim_decision", `An administrator ${req.body.decision} a claim on your found item.`, claim.foundReport._id, claim._id);
    const populated = await Claim.findById(claim._id).populate(claimPopulate(true));
    res.json({ success: true, claim: claimResponse(populated, true) });
  } catch (error) {
    next(error);
  }
};

const getAuthorizedContact = async (claimId, requesterId) => {
  const claim = await Claim.findById(claimId).populate("lostReport foundReport");
  if (!claim || claim.status === "rejected") return { error: "Claim not found", status: 404 };
  const requester = await activeUser(requesterId);
  if (!requester) return { error: "Your account is unavailable", status: 401 };
  const isClaimant = claim.claimant.toString() === requesterId;
  const isFinder = claim.finder.toString() === requesterId;
  if (!isClaimant && !isFinder) return { error: "You are not a participant in this claim", status: 403 };
  const finderAccepted = ["looks_right", "returned_to_owner"].includes(claim.finderDecision);
  const contactVerified = isClaimant
    ? claim.verificationScore >= CONTACT_VERIFICATION_THRESHOLD || finderAccepted
    : finderAccepted;
  if (!contactVerified) {
    return { error: "Contact is available after sufficient match verification or finder review", status: 403 };
  }
  const recipient = await activeUser(isClaimant ? claim.finder : claim.claimant);
  if (!recipient) return { error: "The other account is unavailable", status: 404 };
  return { claim, recipient };
};

export const getClaimContact = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid claim identifier" });
    }
    const result = await getAuthorizedContact(req.params.id, req.auth.userId);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });
    await ContactLog.create({
      claim: result.claim._id,
      requester: req.auth.userId,
      recipient: result.recipient._id,
      action: "view",
    });
    const itemName = result.claim.foundReport.itemName || result.claim.foundReport.title;
    const relayEnabled = process.env.RELAY_EMAIL === "true";
    const contact = {
      name: result.recipient.name,
      ...(relayEnabled ? {} : { email: result.recipient.email }),
      ...(result.recipient.phone ? { phone: result.recipient.phone } : {}),
    };
    res.json({
      success: true,
      claimId: result.claim._id,
      itemName,
      relayEnabled,
      contact,
      ...(!relayEnabled ? {
        email: result.recipient.email,
        claimantEmail: result.recipient.email,
      } : {}),
    });
  } catch (error) {
    next(error);
  }
};

export const relayMessage = async (req, res, next) => {
  try {
    if (process.env.RELAY_EMAIL !== "true") {
      return res.status(503).json({ success: false, message: "Email relay is not enabled" });
    }
    const result = await getAuthorizedContact(req.params.id, req.auth.userId);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !MAIL_FROM) {
      return res.status(503).json({ success: false, message: "Email relay is not configured" });
    }
    const requester = await activeUser(req.auth.userId);
    if (!requester) return res.status(401).json({ success: false, message: "Account unavailable" });
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from: MAIL_FROM,
      to: result.recipient.email,
      subject: "TraceBack claim message",
      text: `${requester.name} sent you a message about a TraceBack claim:\n\n${req.body.message}`,
    });
    await ContactLog.create({
      claim: result.claim._id,
      requester: requester._id,
      recipient: result.recipient._id,
      action: "message",
      message: req.body.message,
    });
    await notify(result.recipient._id, "claim_message", "You received a new message about a claim.", result.claim.foundReport._id, result.claim._id);
    res.status(202).json({ success: true, message: "Message relayed" });
  } catch (error) {
    next(error);
  }
};
