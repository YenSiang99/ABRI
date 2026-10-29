import { Router } from "express";

import { asyncHandler } from "../lib/asyncHandler.js";
import { askModel, askModelConfigured } from "../lib/askModel.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = Router();

const MAX_QUESTION = 500;
// The chat page sends the conversation so far with each question. Only the
// last few turns go to the model: enough for "and how long does that take?",
// and it bounds what one request can cost however long a chat runs.
const MAX_HISTORY = 10;
const MAX_HISTORY_TEXT = 2000;

function readHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_HISTORY_TEXT) }));
}

// Whether to offer the chat at all. Without a key the site leaves it out
// rather than offering one that can only fail.
router.get("/status", (req, res) => {
  res.json({ enabled: askModelConfigured() });
});

// POST /ask { question, history? } — the Ask ABRI chat page. Public and
// anonymous, and every call spends model quota, so each address gets 10
// questions a day (the chat page states the number; change both together).
// The minute window only stops a burst from a script.
router.post(
  "/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: "Too many questions. Wait a minute and try again.",
  }),
  rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 10,
    message: "You've reached today's limit of 10 questions. Try again tomorrow, or see the FAQ.",
  }),
  asyncHandler(async (req, res) => {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) {
      return res.status(400).json({ error: "Type a question first." });
    }
    if (question.length > MAX_QUESTION) {
      return res.status(400).json({ error: `Keep your question under ${MAX_QUESTION} characters.` });
    }

    if (!askModelConfigured()) {
      return res.status(503).json({ error: "The assistant isn't set up." });
    }

    res.json({ answer: await askModel(question, readHistory(req.body.history)) });
  }),
);

export { router as askRouter };
