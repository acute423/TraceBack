import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const uri = process.env.MONGODB_URI || "";
const rest = uri.split("://")[1] || "";
const authority = rest.split(/[/?#]/)[0] || "";

console.log("Environment variable loaded:", Boolean(uri));
console.log("URI protocol valid:", /^mongodb(\+srv)?:\/\//.test(uri));
console.log("Number of @ symbols in credentials/host section:", (authority.match(/@/g) || []).length);
console.log("Host list after credentials present:", authority.includes("@") && Boolean(authority.split("@").at(-1)));
console.log("URI contains newline:", /[\r\n]/.test(uri));

try {
  const client = new MongoClient(uri);
  console.log("MongoDB driver parsing: SUCCESS");
  await client.close();
} catch (error) {
  console.log("MongoDB driver parsing: FAILED");
  console.log("Error name:", error.name);
  console.log("Error message:", error.message);
}
