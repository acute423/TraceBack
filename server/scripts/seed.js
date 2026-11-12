import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import Report from "../src/models/Report.js";
import User from "../src/models/User.js";
import {
  createEmbeddings,
  createTextEmbedding,
  matchNewReport,
} from "../src/services/matchingService.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const samplePassword = process.env.SEED_USER_PASSWORD || password;

if (!email || !password || password.length < 12 || samplePassword.length < 12) {
  throw new Error("Set ADMIN_EMAIL and passwords of at least 12 characters before seeding.");
}

await connectDB();

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await User.findOneAndUpdate(
    { email },
    {
      $set: { name: process.env.ADMIN_NAME || "TraceBack Admin", email, passwordHash, role: "admin", isActive: true },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  const [owner, finder] = await Promise.all([
    User.findOneAndUpdate(
      { email: "demo-owner@traceback.local" },
      {
        $set: {
          name: "TraceBack Demo Owner",
          email: "demo-owner@traceback.local",
          passwordHash: await bcrypt.hash(samplePassword, 12),
          role: "user",
          isActive: true,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ),
    User.findOneAndUpdate(
      { email: "demo-finder@traceback.local" },
      {
        $set: {
          name: "TraceBack Demo Finder",
          email: "demo-finder@traceback.local",
          passwordHash: await bcrypt.hash(samplePassword, 12),
          role: "user",
          isActive: true,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ),
  ]);
  const examples = [
    ["Blue canvas backpack", "Backpack found in Main Hall", "bags", "Main Hall", "A blue canvas backpack with a brass zipper and a small compass keychain.", "Found a blue canvas bag with a brass zipper and a compass keychain near the hall entrance.", "A red compass keychain is attached to the inside pocket.", "The zipper pull has a small star stamped on it."],
    ["Black laptop charger", "Laptop charger found in Science Lab", "electronics", "Science Lab", "A black laptop charger with a long power cable and a compact rectangular adapter.", "Found a black laptop power adapter and its long cable in the science lab.", "The adapter has a yellow label.", "The cable has a short piece of blue tape near the plug."],
    ["Silver water bottle", "Water bottle found at the Gym", "accessories", "Gym", "A silver metal water bottle with three small mountain stickers.", "Found a silver reusable bottle with mountain decals by the gym lockers.", "One sticker has a tiny crescent moon.", "The bottle cap is marked with the initials R K."],
    ["Gray campus hoodie", "Hoodie found in Student Center", "clothing", "Student Center", "A gray hooded sweatshirt with a small tear near the left cuff.", "Found a gray hoodie with a damaged left sleeve in the student center.", "A small tear is on the left cuff.", "There is a handwritten name tag inside the collar."],
    ["Brass key ring", "Keys found in the Library", "keys", "Library", "A brass key ring with two keys and a square green plastic tag.", "Found two brass keys on a ring with a green tag near the library desk.", "The green tag has the number 14 on its reverse.", "One key has a thin red thread looped through it."],
    ["Wireless earbuds case", "Earbuds case found in Science Lab", "electronics", "Science Lab", "A white wireless earbud charging case with a faint blue mark on the lid.", "Found a white earbud case with a blue scuff in the science building.", "There is a blue scuff on the lid.", "A tiny star is drawn inside the case."],
    ["Gold pendant necklace", "Pendant necklace found in Arts Building", "jewelry", "Arts Building", "A delicate gold chain with a small oval pendant and a clasp that sticks.", "Found a thin gold necklace with an oval charm in the arts building.", "The clasp sticks unless pressed to the side.", "The pendant has a small engraving on its back."],
    ["Calculus textbook", "Textbook found in Library", "books", "Library", "A calculus textbook with handwritten notes and a folded page near chapter four.", "Found an annotated calculus book with a folded page in the library.", "A folded page marks chapter four.", "The inside cover has a blue library stamp."],
    ["Black laptop sleeve", "Laptop sleeve found in Computer Lab", "bags", "Computer Lab", "A black padded laptop sleeve with a silver zipper and a loose thread on one corner.", "Found a black computer sleeve with a metal zipper in the computer lab.", "A loose thread sticks out of the lower right corner.", "There is a small white paint dot on the zipper."],
    ["Red calculator", "Calculator found in Engineering Building", "electronics", "Engineering Building", "A red scientific calculator with a cracked corner and a clear protective cover.", "Found a red scientific calculator with its transparent cover in engineering.", "The upper left corner is cracked under the cover.", "The back is labeled with a short pencil mark."],
  ];
  const sampleReports = examples.flatMap(([
    lostTitle, foundTitle, category, location, lostDescription, foundDescription, lostDetails, foundDetails,
  ], index) => {
    const lostDate = new Date(Date.UTC(2026, 10, 2 + index, 12));
    const foundDate = new Date(lostDate.getTime() + 86_400_000);
    return [
      {
        type: "lost",
        title: lostTitle,
        description: lostDescription,
        category,
        location,
        date: lostDate,
        verificationQuestion: "What private detail helps identify this item?",
        hiddenDetails: lostDetails,
        owner,
      },
      {
        type: "found",
        title: foundTitle,
        description: foundDescription,
        category,
        location,
        date: foundDate,
        hiddenDetails: foundDetails,
        owner: finder,
      },
    ];
  });

  for (const sample of sampleReports) {
    const embeddings = await createEmbeddings(sample);
    const hiddenDetailsEmbedding = sample.type === "found"
      ? await createTextEmbedding(sample.hiddenDetails)
      : undefined;
    await Report.findOneAndUpdate(
      { owner: sample.owner._id, type: sample.type, title: sample.title },
      {
        $set: {
          ...sample,
          itemName: sample.title,
          owner: sample.owner._id,
          status: "active",
          photos: [],
          imageUrl: null,
          photoEmbeddings: [],
          ...embeddings,
          ...(hiddenDetailsEmbedding ? { hiddenDetailsEmbedding } : {}),
          matchingStatus: "ready",
          matchingMessage: null,
        },
        $setOnInsert: { matches: [] },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const seededLostReports = await Report.find({ type: "lost", owner: owner._id })
    .select("+textEmbedding +photoEmbeddings +matches");
  for (const report of seededLostReports) await matchNewReport(report);
  console.log("TraceBack admin and 20 sample lost/found reports are ready.");
} finally {
  await mongoose.disconnect();
}
