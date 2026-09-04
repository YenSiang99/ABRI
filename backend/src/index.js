import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { prisma } from "./prisma.js";
import { authRouter } from "./routes/auth.js";
import { businessRouter } from "./routes/businesses.js";
import { adminRouter } from "./routes/admin.js";
import { vouchRouter } from "./routes/vouches.js";
import { connectionRouter } from "./routes/connections.js";
import { followRouter } from "./routes/follows.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
// Behind nginx on the EC2 host, so the client's real IP and protocol arrive
// as X-Forwarded-* headers rather than on the socket. Without this Express
// reports every request as coming from 127.0.0.1 over http.
app.set("trust proxy", 1);

// credentials: true + an explicit origin (not "*") are both required for
// the browser to actually send/accept the httpOnly session cookie.
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRouter);
app.use("/businesses", businessRouter);
app.use("/admin", adminRouter);
app.use("/vouches", vouchRouter);
app.use("/connections", connectionRouter);
app.use("/follows", followRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Confirms the server can actually reach Postgres — hit this once you've
// pasted a real DATABASE_URL and run `npm run prisma:migrate`.
app.get("/health/db", async (req, res) => {
  try {
    const businessCount = await prisma.business.count();
    res.json({ status: "ok", businessCount });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Must be registered after all routes — Express only routes errors here.
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`ABRI backend listening on http://localhost:${port}`);
});
