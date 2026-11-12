import Claim from "../models/Claim.js";
import ContactLog from "../models/ContactLog.js";
import RefreshToken from "../models/RefreshToken.js";
import Report from "../models/Report.js";
import User from "../models/User.js";

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

export const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const currentWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    currentWeek.setUTCDate(currentWeek.getUTCDate() - ((currentWeek.getUTCDay() + 6) % 7));
    const firstWeek = new Date(currentWeek);
    firstWeek.setUTCDate(firstWeek.getUTCDate() - 7 * 7);
    const [users, lostReports, foundReports, claims, pendingClaims, activeReports, resolvedReports,
      resolvedClaims, averageMatch, recentReports] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Report.countDocuments({ type: "lost" }),
      Report.countDocuments({ type: "found" }),
      Claim.countDocuments(),
      Claim.countDocuments({ status: "pending" }),
      Report.countDocuments({ status: "active" }),
      Report.countDocuments({ status: "resolved" }),
      Claim.countDocuments({ adminDecision: "approved" }),
      Claim.aggregate([{ $group: { _id: null, value: { $avg: "$matchScore" } } }]),
      Report.find({ createdAt: { $gte: firstWeek } }).select("type createdAt").lean(),
    ]);
    const weeklyReports = Array.from({ length: 8 }, (_, index) => {
      const start = new Date(firstWeek);
      start.setUTCDate(start.getUTCDate() + index * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      return {
        week: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }),
        lost: 0,
        found: 0,
        total: 0,
      };
    });
    for (const report of recentReports) {
      const index = Math.floor((report.createdAt.getTime() - firstWeek.getTime()) / (7 * 86_400_000));
      if (index < 0 || index >= weeklyReports.length) continue;
      weeklyReports[index][report.type] += 1;
      weeklyReports[index].total += 1;
    }
    const totalReports = lostReports + foundReports;
    res.json({
      success: true,
      stats: {
        users,
        reports: totalReports,
        totalReports,
        lostReports,
        foundReports,
        claims,
        pendingClaims,
        openClaims: pendingClaims,
        activeReports,
        resolvedReports,
        resolvedClaims,
        resolved: resolvedReports,
        averageMatchPercent: Number(((averageMatch[0]?.value || 0) * 100).toFixed(1)),
        weeklyReports,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listAdminClaims = async (req, res, next) => {
  try {
    const filter = {};
    if (req.validatedQuery?.status) filter.status = req.validatedQuery.status;
    const claims = await Claim.find(filter)
      .populate({ path: "lostReport", select: "+hiddenDetails type title itemName category location date status owner verificationQuestion" })
      .populate({ path: "foundReport", select: "+hiddenDetails type title itemName category location date status owner" })
      .populate({ path: "claimant", select: "name email phone isActive" })
      .populate({ path: "finder", select: "name email phone isActive" })
      .populate({ path: "lostReport.owner", select: "name email phone isActive" })
      .populate({ path: "foundReport.owner", select: "name email phone isActive" })
      .sort({ createdAt: -1 })
      .limit(500);
    const contactLogs = claims.length
      ? await ContactLog.find({ claim: { $in: claims.map((claim) => claim._id) } })
        .populate("requester", "name email")
        .populate("recipient", "name email")
        .sort({ createdAt: -1 })
        .lean()
      : [];
    const logsByClaim = new Map();
    for (const log of contactLogs) {
      const key = log.claim.toString();
      const logs = logsByClaim.get(key) || [];
      logs.push(log);
      logsByClaim.set(key, logs);
    }
    const responseClaims = claims.map((claim) => {
      const value = claim.toObject();
      value.itemName = value.foundReport?.itemName || value.foundReport?.title || value.lostReport?.title;
      value.item = value.foundReport;
      value.lostItem = value.lostReport;
      value.foundItem = value.foundReport;
      value.contactLogs = logsByClaim.get(claim._id.toString()) || [];
      return value;
    });
    res.json({ success: true, claims: responseClaims });
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, users: users.map(publicUser) });
  } catch (error) {
    next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    if (req.params.id === req.auth.userId) {
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    const pendingClaims = await Claim.find({
      $or: [{ claimant: user._id }, { finder: user._id }],
      status: "pending",
    }).select("_id lostReport foundReport");
    if (pendingClaims.length) {
      await Claim.updateMany(
        { _id: { $in: pendingClaims.map((claim) => claim._id) }, status: "pending" },
        {
          $set: {
            status: "rejected",
            adminDecision: "rejected",
            adminDecisionAt: new Date(),
            resolvedAt: new Date(),
          },
        }
      );
      const relatedReports = pendingClaims.flatMap((claim) => [claim.lostReport, claim.foundReport]);
      await Report.updateMany(
        { _id: { $in: relatedReports }, status: "pending_claim", owner: { $ne: user._id } },
        { $set: { status: "active", resolvedAt: null } }
      );
    }
    const openReports = await Report.find({
      owner: user._id,
      status: { $in: ["active", "pending_claim"] },
    }).distinct("_id");
    if (openReports.length) {
      await Claim.updateMany(
        { $or: [{ lostReport: { $in: openReports } }, { foundReport: { $in: openReports } }], status: "pending" },
        {
          $set: {
            status: "rejected",
            adminDecision: "rejected",
            adminDecisionAt: new Date(),
            resolvedAt: new Date(),
          },
        }
      );
      await Report.updateMany(
        { _id: { $in: openReports } },
        { $set: { status: "resolved", resolvedAt: new Date() } }
      );
    }
    res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
};
