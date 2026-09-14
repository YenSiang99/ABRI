import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AnswerComposer } from "@/components/app/AnswerComposer";
import { ReportAskDialog } from "@/components/app/ReportAskDialog";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { fetchAsk, acceptAnswer, closeAsk, withdrawAnswer } from "@/lib/api/asks";
import { fetchBusinesses } from "@/lib/api/businesses";
import { toast } from "@/lib/toast";
import { AnswerCard, Pill, Deadline, Empty } from "./AskCard";

// max-w-5xl rather than the board's 7xl: this is one thing read closely, the
// same call BusinessProfile.jsx makes.
function AskDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { business } = useAuth();
  // Refetched rather than decremented after either action, for the reason
  // refreshVouchActions gives: accepting settles the whole ask, and an expiry
  // swept on read can settle others between loads.
  const { refreshAskActions } = useNotifications();

  const [ask, setAsk] = useState(null);
  const [error, setError] = useState(null);
  const [loadedId, setLoadedId] = useState(null);
  const [businesses, setBusinesses] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAsk(id)
      .then((result) => {
        if (cancelled) return;
        setAsk(result);
        setError(null);
        setLoadedId(id);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.status === 404 ? "notfound" : "error");
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The directory, for the answer composer's picker. Fetched here rather than
  // inside the composer so opening the page doesn't fire a second request
  // every time the mode toggle flips.
  useEffect(() => {
    let cancelled = false;
    fetchBusinesses()
      .then((list) => {
        if (!cancelled) setBusinesses(list);
      })
      .catch(() => {
        if (!cancelled) setBusinesses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = loadedId !== id ? "loading" : (error ?? "ready");

  function refetch() {
    fetchAsk(id)
      .then(setAsk)
      .catch(() => {});
  }

  async function onAccept(answerId) {
    setBusy(true);
    try {
      const updated = await acceptAnswer(id, answerId);
      setAsk(updated);
      refreshAskActions();
      toast.success("Answer accepted — your ask is settled.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    setBusy(true);
    try {
      const updated = await closeAsk(id);
      setAsk(updated);
      refreshAskActions();
      toast.success("Ask closed.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    try {
      await withdrawAnswer(id);
      refetch();
      toast.success("Answer withdrawn.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const back = location.state?.from ?? "/app/asks";
  const backLabel = location.state?.label ?? "Back to asks";

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Empty>Loading…</Empty>
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Empty>That ask isn't available.</Empty>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Empty>Couldn't load this ask. Refresh to try again.</Empty>
      </div>
    );
  }

  const answers = ask.answers ?? [];
  const yourAnswer = answers.find((a) => a.answeredBy.id === business?.id);
  const canAnswer =
    business &&
    !ask.askedByYou &&
    ask.status === "open" &&
    ask.slotsLeft > 0 &&
    (!yourAnswer || yourAnswer.status === "withdrawn");

  // Why the composer isn't showing. Four different reasons, four different
  // sentences — "you can't answer" alone would leave a member guessing.
  function whyNot() {
    if (ask.askedByYou) return "This is your ask.";
    if (ask.status === "answered") return "This ask has been answered and is closed.";
    if (ask.status === "closed") return "This ask is closed.";
    if (ask.status === "under_review") return "This ask is on hold while an admin reviews a report.";
    if (yourAnswer) return "You've already answered this one.";
    if (ask.slotsLeft === 0) return "This ask is full — it already has six answers.";
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to={back}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {ask.title}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">
          Asked by{" "}
          <Link
            to={`/app/business/${ask.askedBy.id}`}
            state={{ from: `/app/asks/${ask.id}`, label: "Back to this ask" }}
            className="underline underline-offset-2"
          >
            {ask.askedBy.name}
          </Link>
        </div>
        {ask.detail && <p className="mt-4 text-sm text-muted-foreground">{ask.detail}</p>}

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Pill>{ask.category}</Pill>
          <Pill>
            {ask.matchCategory} in {ask.matchLocation}
          </Pill>
          {ask.status === "open" && ask.slotsLeft > 0 && (
            <Pill muted={false}>
              {ask.slotsLeft} of {ask.maxAnswers} {ask.slotsLeft === 1 ? "slot" : "slots"} left
            </Pill>
          )}
          {ask.status === "open" && ask.slotsLeft === 0 && <Pill>Full — no more answers</Pill>}
          {ask.status === "answered" && <Pill muted={false}>Answered</Pill>}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Deadline ask={ask} className="text-xs text-muted-foreground" />
          <div className="flex gap-2">
            {ask.askedByYou && ask.status === "open" && (
              <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
                Close this ask
              </Button>
            )}
            {/* Reporting is ungated on every tier — a member must always be
                able to report abusive content without paying. */}
            {!ask.askedByYou && business && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReport({ kind: "ask", askId: ask.id, live: ask.status === "open" })}
              >
                Report
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {answers.length} {answers.length === 1 ? "answer" : "answers"}
        </div>

        {answers.length === 0 ? (
          <Empty>
            {ask.askedByYou
              ? "No answers yet. The businesses who do this work will see it on their dashboard."
              : "Nobody has answered yet. If this is your line of work, you'd be first."}
          </Empty>
        ) : (
          <div className="mt-4 space-y-4">
            {answers.map((answer) => (
              <AnswerCard
                key={answer.id}
                answer={answer}
                actions={
                  <>
                    {ask.askedByYou && ask.status === "open" && answer.status === "offered" && (
                      <Button size="sm" onClick={() => onAccept(answer.id)} disabled={busy}>
                        Accept this answer
                      </Button>
                    )}
                    {answer.answeredBy.id === business?.id && answer.status === "offered" && (
                      <Button size="sm" variant="outline" onClick={onWithdraw} disabled={busy}>
                        Withdraw
                      </Button>
                    )}
                    {answer.answeredBy.id !== business?.id && business && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setReport({
                            kind: "answer",
                            askId: ask.id,
                            answerId: answer.id,
                            // An accepted answer is live public content on a
                            // third party's profile, so it freezes too.
                            live: ["offered", "accepted"].includes(answer.status),
                          })
                        }
                      >
                        Report
                      </Button>
                    )}
                  </>
                }
              />
            ))}
          </div>
        )}

        {/* Tells the asker that deciding costs the others nothing, which is
            what makes them decide. Without it, picking one feels like
            rejecting five. */}
        {ask.askedByYou && ask.status === "open" && answers.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Accepting one closes this ask. The others stay as they are — nobody is told they
            weren't picked.
          </p>
        )}
      </div>

      <ReportAskDialog
        open={Boolean(report)}
        onOpenChange={(open) => !open && setReport(null)}
        target={report}
        onSuccess={refetch}
      />

      <div className="mt-8">
        {canAnswer ? (
          <AnswerComposer ask={ask} businesses={businesses} onSuccess={refetch} />
        ) : (
          whyNot() && <p className="text-sm text-muted-foreground">{whyNot()}</p>
        )}
      </div>
    </div>
  );
}

export { AskDetail };
