import dotenv from "dotenv";

dotenv.config();
const uri = process.env.MONGODB_URI || "";

const schemeEnd = uri.indexOf("://");
const scheme = schemeEnd >= 0 ? uri.slice(0, schemeEnd + 3) : "";
const rest = schemeEnd >= 0 ? uri.slice(schemeEnd + 3) : "";

const at = rest.lastIndexOf("@");
const hasCredentials = at >= 0;
const afterCredentials = hasCredentials ? rest.slice(at + 1) : rest;

const slash = afterCredentials.indexOf("/");
const question = afterCredentials.indexOf("?");

const hostEnd = [slash, question]
  .filter(i => i >= 0)
  .reduce((a, b) => Math.min(a, b), afterCredentials.length);

const hosts = afterCredentials.slice(0, hostEnd);
const path = slash >= 0 && (question < 0 || slash < question)
  ? afterCredentials.slice(slash, question >= 0 ? question : undefined)
  : "(none)";

const query = uri.includes("?") ? uri.split("?")[1] : "";
const queryKeys = query
  ? query.split("&").map(part => part.split("=")[0])
  : [];

console.log("Scheme:", scheme || "MISSING");
console.log("Credentials present:", hasCredentials);
console.log("Host list:", hosts || "MISSING");
console.log("Database path:", path);
console.log("Query parameter names:", queryKeys.join(", ") || "(none)");
