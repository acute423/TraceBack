import dotenv from "dotenv";
import fs from "node:fs";
import { MongoClient } from "mongodb";

dotenv.config();

const uri = process.env.MONGODB_URI || "";
const schemeEnd = uri.indexOf("://");

if (schemeEnd < 0) throw new Error("Invalid MongoDB URI protocol.");

const prefix = uri.slice(0, schemeEnd + 3);
const rest = uri.slice(schemeEnd + 3);
const lastAt = rest.lastIndexOf("@");

if (lastAt < 0) throw new Error("Could not locate credentials separator.");

const credentials = rest.slice(0, lastAt);
const hostAndPath = rest.slice(lastAt + 1);
const colon = credentials.indexOf(":");

if (colon < 0) throw new Error("Username/password separator missing.");

const username = credentials.slice(0, colon);
let password = credentials.slice(colon + 1);

try {
  password = decodeURIComponent(password);
} catch {
  // Keep the original password if it contains invalid percent encoding.
}

const fixedUri =
  prefix + username + ":" + encodeURIComponent(password) + "@" + hostAndPath;

const envPath = ".env";
let envText = fs.readFileSync(envPath, "utf8");

if (!/^MONGODB_URI\s*=/m.test(envText)) {
  throw new Error("MONGODB_URI entry not found in .env");
}

envText = envText.replace(/^MONGODB_URI\s*=.*$/m, `MONGODB_URI=${fixedUri}`);
fs.writeFileSync(envPath, envText, "utf8");

console.log("MongoDB URI password encoding corrected in .env.");

try {
  const client = new MongoClient(fixedUri);
  console.log("MongoDB driver parsing: SUCCESS");
  await client.close();
} catch (error) {
  console.log("MongoDB driver parsing: FAILED");
  console.log(error.message);
}
