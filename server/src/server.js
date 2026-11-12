import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`TraceBack API running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("TraceBack API startup failed:", error.message);
  process.exitCode = 1;
});
