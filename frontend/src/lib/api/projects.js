import { apiFetch } from "./client";

// Projects — the workspace between an ask and a work record.
//
// TWO RULES THE SERVER ENFORCES that a caller here should not be surprised by:
//
//   L2 CREATES, L1 JOINS. createProject answers 403 for a business that isn't
//   SSM-verified, and it is a 403 rather than a 402 — verification cannot be
//   bought, so there is no upgrade prompt to show. Anyone with a claimed
//   listing can be invited in and join.
//
//   A SERVICE BELONGS TO THE BUSINESS THAT PROVIDES IT. An invite may propose
//   one; only the invitee settles it, at join or afterwards via
//   setParticipationService — which takes no business id, in the path or the
//   body, because the row is resolved from the session. That is what makes
//   completing a project able to write CONFIRMED engagements without anybody
//   being credited with work they never claimed.
//
// Note there is no removeParticipant: leaving is your own row and your own
// decision. deleteProject exists only for a project that never finished — see
// the note on it.

function fetchProjects({ status, participation } = {}) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (participation) query.set("participation", participation);
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetch(`/projects${suffix}`).then((d) => d.projects);
}

function fetchProject(id) {
  return apiFetch(`/projects/${id}`).then((d) => d.project);
}

// `invites` is [{ businessId, service? }]. `service` at the top level is the
// CREATOR's own — they join their own project outright, so they declare what
// they are delivering the same way everyone else does.
function createProject({ title, detail, startedOn, visibility, service, askId, invites }) {
  return apiFetch("/projects", {
    method: "POST",
    body: { title, detail, startedOn, visibility, service, askId, invites },
  }).then((d) => d.project);
}

function inviteToProject(id, { businessId, service }) {
  return apiFetch(`/projects/${id}/invite`, {
    method: "POST",
    body: { businessId, service },
  }).then((d) => d.project);
}

// Omitting `service` keeps whatever the invite proposed — which joining is an
// acceptance of. Passing it is the invitee correcting it.
function joinProject(id, { service } = {}) {
  return apiFetch(`/projects/${id}/join`, {
    method: "POST",
    body: service === undefined ? {} : { service },
  }).then((d) => d.project);
}

function declineProject(id) {
  return apiFetch(`/projects/${id}/decline`, { method: "POST" }).then((d) => d.project);
}

function leaveProject(id) {
  return apiFetch(`/projects/${id}/leave`, { method: "POST" }).then((d) => d.project);
}

function setParticipationService(id, service) {
  return apiFetch(`/projects/${id}/participation`, {
    method: "PATCH",
    body: { service },
  }).then((d) => d.project);
}

function postProjectUpdate(id, body) {
  return apiFetch(`/projects/${id}/updates`, { method: "POST", body: { body } }).then(
    (d) => d.project,
  );
}

// Resolves to { project, mintedEngagements } rather than the project alone —
// the count is the whole point of the call, and it is what lets the UI say what
// just landed on everybody's public record instead of "Saved".
function completeProject(id, { completedOn } = {}) {
  return apiFetch(`/projects/${id}/complete`, { method: "POST", body: { completedOn } });
}

function cancelProject(id) {
  return apiFetch(`/projects/${id}/cancel`, { method: "POST" }).then((d) => d.project);
}

function patchProject(id, { title, detail, visibility }) {
  return apiFetch(`/projects/${id}`, {
    method: "PATCH",
    body: { title, detail, visibility },
  }).then((d) => d.project);
}

// For the one you started by accident. The server refuses a COMPLETED project
// (409): completing it wrote confirmed engagements onto other businesses'
// profiles, and those are not the creator's to erase. Everything a
// non-completed project owns — its timeline and its participants — goes with it.
function deleteProject(id) {
  return apiFetch(`/projects/${id}`, { method: "DELETE" });
}

export {
  deleteProject,
  fetchProjects,
  fetchProject,
  createProject,
  inviteToProject,
  joinProject,
  declineProject,
  leaveProject,
  setParticipationService,
  postProjectUpdate,
  completeProject,
  cancelProject,
  patchProject,
};
