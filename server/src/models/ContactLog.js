import mongoose from "mongoose";

const contactLogSchema = new mongoose.Schema(
  {
    claim: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", required: true, index: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["view", "message"], required: true },
    message: { type: String, maxlength: 3000, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("ContactLog", contactLogSchema);
