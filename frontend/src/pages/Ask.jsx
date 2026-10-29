import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, RotateCcw } from "lucide-react";

import { AbriMark } from "@/components/layout/AbriMark";
import { askAbri, fetchAskStatus } from "@/lib/api/ask";

// Ask ABRI: a chat about ABRI itself. Answers come from a model reading
// backend/src/content/abri-knowledge.md, so to change what it knows, edit
// that file. The FAQ page stays the official word and is linked under the box.
//
// The conversation lives in this component only; a reload starts a new chat.

// Mirrors the daily limit in backend/src/routes/ask.js.
const DAILY_LIMIT = 10;

const SUGGESTIONS = [
  "What is ABRI?",
  "How do I claim my business?",
  "Can I pay for the SSM-Verified badge?",
  "What do the paid plans include?",
];

function Ask() {
  // null while the status call is in flight, so the page doesn't flash
  // "unavailable" before it knows.
  const [enabled, setEnabled] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchAskStatus().then(setEnabled, () => setEnabled(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, error]);

  // Grows with what's typed, up to a cap, the way ChatGPT's box does.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  async function send(text) {
    const question = text.trim();
    if (!question || loading) return;
    const history = messages;
    setMessages([...history, { role: "user", text: question }]);
    setDraft("");
    setError(null);
    setLoading(true);
    try {
      const answer = await askAbri(question, history);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e) {
    // Enter sends, Shift+Enter is a new line. isComposing: don't send halfway
    // through an IME composition (Chinese, Japanese input).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  }

  function newChat() {
    setMessages([]);
    setError(null);
    setDraft("");
    inputRef.current?.focus();
  }

  if (enabled === null) return <div className="h-[calc(100dvh-68px)]" />;

  if (!enabled) {
    return (
      <div className="flex h-[calc(100dvh-68px)] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-ink dark:text-foreground">Ask ABRI isn&rsquo;t available right now</h1>
        <p className="mt-3 text-grey-600 dark:text-muted-foreground">
          Most questions are answered in our <Link to="/faq" className="font-semibold underline underline-offset-4">FAQ</Link>.
        </p>
      </div>
    );
  }

  const empty = messages.length === 0 && !loading;

  return (
    <div className="flex h-[calc(100dvh-68px)] flex-col">
      <p className="border-b border-grey-200 bg-yellow-soft px-4 py-2 text-center text-xs text-ink dark:border-border dark:bg-muted dark:text-foreground">
        You can ask up to {DAILY_LIMIT} questions a day.
      </p>
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-[760px] flex-col items-center justify-center px-4 text-center">
            <h1 className="text-[clamp(24px,3.4vw,34px)] font-extrabold tracking-[-0.02em] text-ink dark:text-foreground">
              What would you like to know about ABRI?
            </h1>
            <div className="mt-8 grid w-full max-w-[560px] gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl border border-grey-200 px-4 py-3 text-left text-sm text-grey-600 transition-colors hover:bg-grey-100 hover:text-ink dark:border-border dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[760px] space-y-6 px-4 py-8">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={newChat}
                className="flex items-center gap-1.5 text-xs font-semibold text-grey-500 hover:text-ink dark:text-muted-foreground dark:hover:text-foreground"
              >
                <RotateCcw className="size-3.5" /> New chat
              </button>
            </div>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[80%] rounded-3xl bg-grey-100 px-5 py-2.5 whitespace-pre-line text-ink dark:bg-muted dark:text-foreground">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <Avatar />
                  <p className="pt-1 leading-relaxed whitespace-pre-line text-ink dark:text-foreground">{m.text}</p>
                </div>
              ),
            )}
            {loading && (
              <div className="flex gap-3">
                <Avatar />
                <div className="flex items-center gap-1 pt-2" aria-label="Thinking">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="size-2 animate-bounce rounded-full bg-grey-400"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="mx-auto flex max-w-[760px] items-end gap-2 rounded-3xl border border-grey-200 bg-white p-2 pl-5 shadow-sm focus-within:border-grey-400 dark:border-border dark:bg-card"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={500}
            autoFocus
            placeholder="Ask anything about ABRI"
            aria-label="Your question"
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-[16px] text-ink outline-none placeholder:text-grey-500 dark:text-foreground"
          />
          <button
            type="submit"
            disabled={loading || !draft.trim()}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-opacity disabled:opacity-30 dark:bg-foreground dark:text-background"
          >
            <ArrowUp className="size-5" />
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-grey-500 dark:text-muted-foreground">
          AI answers can be wrong. The <Link to="/faq" className="underline underline-offset-2">FAQ</Link> is the
          official word.
        </p>
      </div>
    </div>
  );
}

// The ABRI mark beside each answer; swaps with the theme like the header logo.
function Avatar() {
  return <AbriMark className="h-7 shrink-0 self-start" />;
}

export { Ask };
