import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    report: { type: mongoose.Schema.Types.ObjectId, ref: "Report", required: true },
    score: { type: Number, min: 0, max: 1, required: true },
    breakdown: {
      imageSim: { type: Number, default: 0 },
      textSim: { type: Number, default: 0 },
      categoryMatch: { type: Number, default: 0 },
      locationSim: { type: Number, default: 0 },
      dateScore: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["lost", "found"], required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    itemName: { type: String, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    category: { type: String, required: true, trim: true, lowercase: true, maxlength: 80, index: true },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    date: { type: Date, required: true },
    imageUrl: { type: String, default: null },
    photos: { type: [String], default: [] },
    photoEmbeddings: { type: [[Number]], default: undefined, select: false },
    verificationQuestion: { type: String, trim: true, maxlength: 500, default: "" },
    hiddenDetails: { type: String, trim: true, maxlength: 2000, select: false },
    status: {
      type: String,
      enum: ["active", "pending_claim", "resolved"],
      default: "active",
      index: true,
    },
    resolvedAt: { type: Date, default: null },
    imageEmbedding: { type: [Number], default: undefined, select: false },
    textEmbedding: { type: [Number], default: undefined, select: false },
    hiddenDetailsEmbedding: { type: [Number], default: undefined, select: false },
    matchingStatus: { type: String, enum: ["ready", "degraded", "unavailable"], default: "unavailable" },
    matchingMessage: { type: String, default: null },
    matches: { type: [matchSchema], default: [], select: false },
  },
  { timestamps: true }
);

reportSchema.index({ type: 1, status: 1, category: 1, createdAt: -1 });

export default mongoose.model("Report", reportSchema);
