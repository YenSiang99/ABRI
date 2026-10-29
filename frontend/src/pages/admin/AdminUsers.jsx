import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchAdminAccounts, updateAdminAccount, deleteAdminAccount } from "@/lib/api/admin";
import { toast } from "@/lib/toast";

// Every account, with edit and delete. Both are mostly for a signup stuck
// before its confirmation email: mark it verified to let them log in, or
// delete it so the address can register again. Deleting an approved
// claimant releases their business back to unclaimed, and the dialog says
// so before it happens.

const PAGE_SIZES = [25, 50, 100];
const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring";
const EMPTY_FILTERS = { email: "", name: "", verified: "", claimStatus: "" };
const FORM_FIELDS = ["email", "name", "phone", "role"];

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function EditDialog({ account, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    setForm({
      ...Object.fromEntries(FORM_FIELDS.map((k) => [k, account[k] ?? ""])),
      emailVerified: account.emailVerified,
    });
  }, [account]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAdminAccount(account.id, form);
      toast.success(`${form.email} saved`);
      onClose();
      await onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(account)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {account?.business
              ? `${account.business.name} (${account.claimStatus}). Claims are changed on the Claims review page.`
              : "No business."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <Field label="Email" hint="Their login. Changing it cancels any confirmation link already sent.">
            <Input type="email" value={form.email ?? ""} onChange={set("email")} required />
          </Field>
          <Field label="Name">
            <Input value={form.name ?? ""} onChange={set("name")} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={set("phone")} required />
            </Field>
            <Field label="Role">
              <Input value={form.role ?? ""} onChange={set("role")} required />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={Boolean(form.emailVerified)}
              onChange={(e) => setForm((f) => ({ ...f, emailVerified: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-foreground">Email verified</span>
              <span className="block text-xs text-muted-foreground">
                Tick to let them log in without the confirmation link.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ account, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const business = account?.business;
  const owns = account?.claimStatus === "approved" && business;
  const pending = account?.claimStatus === "pending" && business;

  async function confirm() {
    setBusy(true);
    try {
      await deleteAdminAccount(account.id, { releaseBusiness: Boolean(owns) });
      toast.success(
        `${account.email} deleted${owns ? `; ${business.name} is unclaimed again` : ""}`,
      );
      onClose();
      await onDeleted();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(account)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {account?.email}?</DialogTitle>
          <DialogDescription>
            This can&rsquo;t be undone. The same email can sign up again.
            {pending && (
              <>
                {" "}
                Their pending claim on <strong>{business.name}</strong> will be withdrawn.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {owns && (
          <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This account owns <strong>{business.name}</strong> ({business.verificationLevel}).
              Deleting it makes the business unclaimed (L0) and anyone can claim it again. Its
              endorsements and connections stay with the listing.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy ? "Deleting…" : owns ? "Delete and release business" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminUsers() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Text filters are applied after a short pause so each keystroke isn't a
  // request.
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState({ accounts: [], total: 0 });
  const [status, setStatus] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(filters);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  const load = useCallback(async () => {
    try {
      setData(await fetchAdminAccounts({ ...applied, page, pageSize }));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [applied, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const pages = Math.max(1, Math.ceil(data.total / pageSize));
  const from = data.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, data.total);

  const textFilter = (key) => (
    <Input value={filters[key]} onChange={setFilter(key)} placeholder="Filter" className="h-7" />
  );
  const columns = [
    { label: "Email", filter: textFilter("email") },
    { label: "Name", filter: textFilter("name") },
    {
      label: "Verified",
      filter: (
        <select className={SELECT_CLASS} value={filters.verified} onChange={setFilter("verified")}>
          <option value="">All</option>
          <option value="yes">Verified</option>
          <option value="no">Unverified</option>
        </select>
      ),
    },
    {
      label: "Business",
      filter: (
        <select className={SELECT_CLASS} value={filters.claimStatus} onChange={setFilter("claimStatus")}>
          <option value="">All</option>
          <option value="approved">Owns one</option>
          <option value="pending">Pending claim</option>
          <option value="rejected">Rejected claim</option>
          <option value="none">None</option>
        </select>
      ),
    },
    { label: "Created", filter: null },
    { label: "", filter: null },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Admin</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Users</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Every account. Edit details or mark an email verified, or delete an account so the
        email can sign up again. Deleting a business owner makes their business claimable again.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 align-top">
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-medium text-foreground">
                  <div className="mb-1">{c.label}</div>
                  {c.filter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {status === "ready" &&
              data.accounts.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {a.email}
                    {a.isAdmin && <span className="ml-2 text-xs text-muted-foreground">(admin)</span>}
                  </td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">{a.emailVerified ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    {a.business ? (
                      <>
                        {a.business.name}{" "}
                        <span className="text-xs text-muted-foreground">({a.claimStatus})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${a.email}`} onClick={() => setEditing(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!a.isAdmin && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${a.email}`} onClick={() => setDeleting(a)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {status === "loading" && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
        {status === "error" && (
          <p className="p-6 text-sm text-muted-foreground">Couldn&rsquo;t load the accounts.</p>
        )}
        {status === "ready" && data.accounts.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No accounts match these filters.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Showing {from.toLocaleString()}–{to.toLocaleString()} of {data.total.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <select
            className={`${SELECT_CLASS} w-auto`}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span>
            Page {page} of {pages.toLocaleString()}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>

      <EditDialog account={editing} onClose={() => setEditing(null)} onSaved={load} />
      <DeleteDialog account={deleting} onClose={() => setDeleting(null)} onDeleted={load} />
    </div>
  );
}

export { AdminUsers };
