import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AnswerComposer } from "@/components/app/AnswerComposer";
import { ReportAskDialog } from "@/components/app/ReportAskDialog";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { fetchAsk, acceptAnswer, closeAsk, withdrawAnswer } from "@/lib/api/asks";
import { fetchBusinesses } from "@/lib/api/businesses";
import { toast } from "@/lib/toast";
import { ProjectDialog } from "@/components/app/ProjectDialog";
import { AnswerCard, Pill, Deadline, Empty } from "./AskCard";

// max-w-5xl rather than the board's 7xl: this is one thing read closely, the
// same call BusinessProfile.jsx makes.
function AskDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [startProject, setStartProject] = useState(null);

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
      toast.success("Offer accepted — your request is settled.");
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
      toast.success("Request closed.");
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
      toast.success("Offer withdrawn.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const back = location.state?.from ?? "/app/requests";
  const backLabel = location.state?.label ?? "Back to requests";

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
        <Empty>That request isn't available.</Empty>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Empty>Couldn't load this request. Refresh to try again.</Empty>
      </div>
    );
  }

  const answers = ask.answers ?? [];
  // Only ever the viewer's own — the server filters, not this line.
  const projects = ask.yourProjects ?? [];
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
    if (ask.askedByYou) return "This is your request.";
    if (ask.status === "answered") return "This request has been settled and is closed.";
    if (ask.status === "closed") return "This request is closed.";
    if (ask.status === "under_review") return "This request is on hold while an admin reviews a report.";
    if (yourAnswer) return "You've already made an offer on this one.";
    if (ask.slotsLeft === 0) return "This request is full — it isn't taking more offers.";
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
            state={{ from: `/app/requests/${ask.id}`, label: "Back to this request" }}
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
          {ask.status === "open" && ask.slotsLeft === 0 && <Pill>Full — no more offers</Pill>}
          {ask.status === "answered" && <Pill muted={false}>Settled</Pill>}
        </div>

        {/* WHAT THIS ASK TURNED INTO, and the half the bridge was missing.
            Starting a project recorded which ask it came from and the ask said
            nothing back — so a member who started one, went away and returned
            found the same "Start a project" button, no sign anything existed
            and no route to it. Pressing it again is the reasonable move, and
            it is how one ask ends up with three identical projects.

            Only the viewer's own projects are ever in this list — see the
            filter in serializeAsk. */}
        {projects.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {projects.length === 1 ? "This became a project" : "Projects from this request"}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {projects.map((project) => (
                <div key={project.id} className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link
                        to={`/app/projects/${project.id}`}
                        state={{ from: `/app/requests/${ask.id}`, label: "Back to this request" }}
                      />
                    }
                    nativeButton={false}
                  >
                    <FolderKanban className="h-3.5 w-3.5" /> {project.title}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {project.status === "active"
                      ? "In progress"
                      : project.status === "completed"
                        ? "Finished"
                        : "Cancelled"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <Deadline ask={ask} className="text-xs text-muted-foreground" />
          <div className="flex gap-2">
            {ask.askedByYou && ask.status === "open" && (
              <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
                Close this request
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
          {answers.length} {answers.length === 1 ? "offer" : "offers"}
        </div>

        {answers.length === 0 ? (
          <Empty>
            {ask.askedByYou
              ? "No offers yet. The businesses who do this work will see it on their dashboard."
              : "Nobody has made an offer yet. If this is your line of work, you'd be first."}
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
                        Accept this offer
                      </Button>
                    )}
                    {/* THE BRIDGE, and the reason this is a button on the card
                        rather than something offered in the accept toast: a
                        toast is gone on the next reload, and until now
                        accepting an answer was a dead end — the ask closed and
                        the asker went off to find a phone number.

                        Only the ASKER sees it. Posting an ask needs L2, so the
                        asker can always create a project; an L1 answerer would
                        hit a 403 every time.

                        An unclaimed (L0) business cannot be invited, so the
                        dialog opens with nothing pre-filled and says why. */}
                    {ask.askedByYou && answer.status === "accepted" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setStartProject({
                            title: ask.title,
                            askId: ask.id,
                            invite:
                              answer.recommended.verificationLevel === "L0"
                                ? null
                                : answer.recommended,
                          })
                        }
                        variant={projects.length > 0 ? "outline" : undefined}
                      >
                        <FolderKanban className="h-3.5 w-3.5" />{" "}
                        {/* Not "Start a project" once one exists. A second
                            project from one ask is legitimate — two suppliers,
                            two pieces of work — so this stays available rather
                            than being hidden, but it must not read as though
                            the first press did nothing. */}
                        {projects.length > 0 ? "Start another project" : "Start a project"}
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
            Accepting one closes this request. The others stay as they are — nobody is told they
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

      <ProjectDialog
        open={Boolean(startProject)}
        onOpenChange={(open) => !open && setStartProject(null)}
        initial={startProject}
        onSuccess={(project) =>
          navigate(`/app/projects/${project.id}`, {
            state: { from: `/app/requests/${ask.id}`, label: "Back to this request" },
          })
        }
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
