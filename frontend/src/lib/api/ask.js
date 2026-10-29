import { apiFetch } from "./client";

// Mirrors backend/src/routes/ask.js — the Ask ABRI chat (pages/Ask.jsx).

// Whether the backend has a model configured; the chat is left out if not.
function fetchAskStatus() {
  return apiFetch("/ask/status").then((data) => data.enabled);
}

// `history`: the conversation so far, oldest first, as { role, text }.
function askAbri(question, history = []) {
  return apiFetch("/ask", { method: "POST", body: { question, history } }).then((data) => data.answer);
}

export { fetchAskStatus, askAbri };
