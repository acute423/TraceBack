import mongoose from "mongoose";
import Claim from "../models/Claim.js";
import Notification from "../models/Notification.js";
import Report from "../models/Report.js";
import {
  createEmbeddings,
  createTextEmbedding,
  matchNewReport,
} from "../services/matchingService.js";
import { uploadReportImage } from "../services/imageService.js";

const publicReport = (report, { admin = false, includeHiddenDetails = false } = {}) => {
  const value = report.toObject ? report.toObject() : { ...report };
  delete value.imageEmbedding;
  delete value.photoEmbeddings;
  delete value.textEmbedding;
  delete value.hiddenDetailsEmbedding;
  delete value.matches;
  if (!admin) delete value.owner;
  if (!admin && !includeHiddenDetails) delete value.hiddenDetails;
  value.itemName = value.itemName || value.title;
  if (value.type === "lost") value.lostDate = value.date;
  if (value.type === "found") value.foundDate = value.date;
  value.photos = value.photos?.length ? value.photos : value.imageUrl ? [value.imageUrl] : [];
  return value;
};

const reportType = (req) => req.baseUrl.includes("/lost") ? "lost" : "found";

const uploadedPhotos = async (files = []) => Promise.all(files.map(uploadReportImage));

export const listReports = async (req, res, next) => {
  try {
    const type = reportType(req);
    const isPublic = req.path === "/public";
    const filter = isPublic
      ? { type: "found", status: "active" }
      : { type, owner: req.auth.userId };
    const query = req.validatedQuery || {};
    if (query.category) filter.category = query.category.toLowerCase();
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
        { location: { $regex: escaped, $options: "i" } },
      ];
    }
    const reports = await Report.find(filter)
      .select(!isPublic && type === "found" ? "+hiddenDetails" : "")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({
      success: true,
      reports: reports.map((report) => publicReport(report, {
        includeHiddenDetails: !isPublic && type === "found",
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const createReport = async (req, res, next) => {
  try {
    const type = reportType(req);
    const {
      title, description, category, location, date, hiddenDetails, verificationQuestion,
    } = req.body;
    if (type === "found" && !hiddenDetails?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Add at least one private verification detail before posting a found item.",
      });
    }
    const files = req.reportImages || [];
    const [photos, embeddings, hiddenDetailsEmbedding] = await Promise.all([
      uploadedPhotos(files),
      createEmbeddings({
        title, description, category, location,
        imageBuffers: files.map((file) => file.buffer),
      }),
      type === "found" ? createTextEmbedding(hiddenDetails) : Promise.resolve(undefined),
    ]);
    const report = await Report.create({
      type,
      owner: req.auth.userId,
      title,
      itemName: title,
      description,
      category,
      location,
      date,
      hiddenDetails,
      verificationQuestion,
      imageUrl: photos[0] || null,
      photos,
      ...embeddings,
      ...(hiddenDetailsEmbedding ? { hiddenDetailsEmbedding } : {}),
      matchingStatus: "ready",
    });
    const matching = await matchNewReport(report);
    if (matching.matches.length) {
      const matchedReports = await Report.find({
        _id: { $in: matching.matches.map((match) => match.report) },
      }).select("owner title type");
      await Notification.insertMany([
        {
          user: req.auth.userId,
          type: "match",
          message: `${matching.matches.length} potential match${matching.matches.length === 1 ? "" : "es"} found for your report.`,
          report: report._id,
        },
        ...matchedReports.map((item) => ({
          user: item.owner,
          type: "match",
          message: `A new potential match was found for "${item.title}".`,
          report: item._id,
        })),
      ]);
    }
    res.status(201).json({
      success: true,
      report: publicReport(report, { includeHiddenDetails: type === "found" }),
      matching: { status: matching.matchingStatus, message: matching.message },
    });
  } catch (error) {
    next(error);
  }
};

export const getReport = async (req, res, next) => {
  try {
    const admin = req.auth.role === "admin";
    const report = await Report.findById(req.params.id).select("+hiddenDetails");
    if (!report || report.type !== reportType(req)) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    const owner = report.owner.toString() === req.auth.userId;
    if (!admin && !owner && (report.type === "lost" || report.status !== "active")) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    res.json({
      success: true,
      report: publicReport(report, {
        admin,
        includeHiddenDetails: report.type === "found" && owner,
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    if (req.body.status === "returned" && reportType(req) === "found") {
      const report = await Report.findOne({
        _id: req.params.id,
        type: "found",
        owner: req.auth.userId,
        status: "pending_claim",
      });
      if (!report) {
        return res.status(409).json({
          success: false,
          message: "A found item can be marked returned only while reviewing a pending claim.",
        });
      }
      const claim = await Claim.findOne({
        foundReport: report._id,
        finder: req.auth.userId,
        status: "pending",
        adminDecision: "pending",
      });
      if (!claim) return res.status(404).json({ success: false, message: "Pending claim not found" });
      if (claim.finderDecisionAt) {
        return res.status(409).json({ success: false, message: "This claim has already been reviewed" });
      }
      claim.finderDecision = "returned_to_owner";
      claim.finderDecisionAt = new Date();
      await claim.save();
      try {
        await Notification.create({
          user: claim.claimant,
          type: "claim_finder_review",
          message: "The finder marked the item as returned to its owner. The claim is awaiting administrator approval.",
          report: report._id,
          claim: claim._id,
        });
      } catch (notificationError) {
        console.error("Could not create claim notification:", notificationError.message);
      }
      return res.json({
        success: true,
        report: publicReport(report),
        claimId: claim._id,
        finderDecision: claim.finderDecision,
      });
    }
    if (
      reportType(req) === "found"
      && "hiddenDetails" in req.body
      && !req.body.hiddenDetails?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Found reports must keep at least one private verification detail.",
      });
    }
    const report = await Report.findOne({
      _id: req.params.id,
      type: reportType(req),
      owner: req.auth.userId,
      status: "active",
    }).select("+hiddenDetails +hiddenDetailsEmbedding +photoEmbeddings +imageEmbedding +textEmbedding +matches");
    if (!report) return res.status(404).json({ success: false, message: "Active report not found" });
    const previousHiddenDetails = report.hiddenDetails;
    Object.assign(report, req.body);
    report.itemName = report.title;
    const files = req.reportImages || [];
    const changedText = ["title", "description", "category", "location"].some((key) => key in req.body);
    if (
      report.type === "found"
      && "hiddenDetails" in req.body
      && req.body.hiddenDetails !== previousHiddenDetails
    ) {
      report.hiddenDetailsEmbedding = await createTextEmbedding(req.body.hiddenDetails);
    }
    if (files.length || changedText) {
      const [photos, embeddings] = await Promise.all([
        files.length ? uploadedPhotos(files) : report.photos,
        createEmbeddings({
          title: report.title, description: report.description,
          category: report.category, location: report.location,
          imageBuffers: files.length ? files.map((file) => file.buffer) : [],
        }),
      ]);
      if (files.length) {
        report.photos = photos;
        report.imageUrl = photos[0] || null;
        report.photoEmbeddings = embeddings.photoEmbeddings;
      }
      report.textEmbedding = embeddings.textEmbedding;
    }
    await report.save();
    if (changedText || files.length) await matchNewReport(report);
    res.json({
      success: true,
      report: publicReport(report, { includeHiddenDetails: report.type === "found" }),
      ...(report.matchingStatus ? {
        matching: { status: report.matchingStatus, message: report.matchingMessage },
      } : {}),
    });
  } catch (error) {
    next(error);
  }
};

export const getMatches = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid report identifier" });
    }
    const report = await Report.findById(req.params.id).select("+matches");
    if (!report || report.type !== reportType(req)) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    if (report.owner.toString() !== req.auth.userId && req.auth.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only the report owner can view matches" });
    }
    const candidateIds = report.matches.map((match) => match.report);
    const candidates = await Report.find({ _id: { $in: candidateIds }, status: "active" });
    const byId = new Map(candidates.map((item) => [item._id.toString(), item]));
    const status = report.matchingStatus || "unavailable";
    res.json({
      success: true,
      matching: {
        status,
        message: report.matchingMessage
          || (status === "unavailable" ? "Required embeddings are missing; no matching conclusion is available." : null),
      },
      matches: report.matches
        .filter((match) => byId.has(match.report.toString()))
        .map((match) => ({
          report: publicReport(byId.get(match.report.toString())),
          ...(report.type === "lost"
            ? { foundItem: publicReport(byId.get(match.report.toString())) }
            : { lostItem: publicReport(byId.get(match.report.toString())) }),
          score: match.score,
          matchScore: match.score,
          breakdown: match.breakdown,
        })),
    });
  } catch (error) {
    next(error);
  }
};

export const closeReport = async (req, res, next) => {
  try {
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, type: reportType(req), owner: req.auth.userId, status: "active" },
      { $set: { status: "resolved", resolvedAt: new Date() } },
      { new: true }
    );
    if (!report) return res.status(404).json({ success: false, message: "Active report not found" });
    res.json({ success: true, report: publicReport(report) });
  } catch (error) {
    next(error);
  }
};
