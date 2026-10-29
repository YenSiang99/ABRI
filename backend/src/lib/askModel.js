import { readFileSync } from "node:fs";

// The Ask ABRI chat page (/ask). No training and no search index: the
// whole of content/abri-knowledge.md goes to the model with every question,
// and the instructions keep it to that document. It is a few pages, which
// any current model reads in full for a fraction of a cent (or free, on
// Gemini's free tier). If it ever grows past a few dozen pages, that is the
// point to split it and send only the relevant sections.
//
// The provider lives in this one function so swapping it (Groq, Claude Haiku)
// touches nothing else.
const KNOWLEDGE = readFileSync(new URL("../content/abri-knowledge.md", import.meta.url), "utf8");

const INSTRUCTIONS = `You are the help assistant on ABRI's website. Answer the visitor's question using ONLY the document below.

- Keep answers short: a few sentences in plain language. Use a short numbered list only for step-by-step instructions. No headings, no bold.
- This is a conversation: earlier messages are context for the latest question.
- If the document doesn't answer the question, say you don't know and suggest contacting the ABRI team through the Contact page. Don't guess.
- Never invent features, prices, dates or policies.
- Politely decline anything unrelated to ABRI.

<document>
${KNOWLEDGE}
</document>`;

// Flash-Lite: the cheapest Gemini, with the most generous free quota, and
// plenty for answering from one short document. Overridable without a deploy
// of new code.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

function askModelConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// `history` is the conversation so far, oldest first, as { role: "user" |
// "assistant", text } — the route has already validated and trimmed it.
async function askModel(question, history = []) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [
          ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
          { role: "user", parts: [{ text: question }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
      }),
    },
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Logged in full for us; the visitor gets a generic line. A 429 here is
    // Google's free quota running out, not our own limiter.
    console.error("Gemini error", res.status, data?.error?.message);
    throw Object.assign(new Error("The assistant isn't available right now. Try the questions below."), {
      status: 503,
    });
  }

  const answer = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!answer) {
    throw Object.assign(new Error("No answer came back. Try rephrasing your question."), { status: 502 });
  }
  return answer;
}

export { askModel, askModelConfigured };
