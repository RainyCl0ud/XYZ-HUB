import { prisma } from "./lib/prisma.js";
import chatterRoutes from "./routes/chatters.js";
import severityOptionRoutes from "./routes/severity-options.js";
import weightOptionRoutes from "./routes/weight-options.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/chatters", chatterRoutes);
app.use("/api/severity-options", severityOptionRoutes);
app.use("/api/weight-options", weightOptionRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "XYZ Hub API is running"
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    const chatterCount = await prisma.chatter.count();

    res.status(200).json({
      status: "ok",
      message: "Database connection is working",
      chatterCount,
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});