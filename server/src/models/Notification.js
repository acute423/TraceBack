import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true },
    message: { type: String, required: true, maxlength: 500 },
    report: { type: mongoose.Schema.Types.ObjectId, ref: "Report", default: null },
    claim: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
