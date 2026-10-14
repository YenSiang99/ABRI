import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAdminBusinesses,
  createAdminBusiness,
  updateAdminBusiness,
  deleteAdminBusiness,
} from "@/lib/api/admin";
import { BUSINESS_CATEGORIES, BUSINESS_LOCATIONS } from "@/lib/businessVocab";
import { toast } from "@/lib/toast";

// Add, edit and delete listings by hand. Made for testing the claim flow: a
// business whose Domain matches the claimant's email is approved on the spot,
// any other is reviewed by an admin. Level, plan and claims are not editable
// here; they have their own screens.

const PAGE_SIZES = [25, 50, 100];
const LEVELS = ["L0", "L1", "L2", "L3", "L4"];
const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring";
const EMPTY_FILTERS = {
  name: "",
  id: "",
  category: "",
  location: "",
  domain: "",
  email: "",
  verificationLevel: "",
  claimed: "",
};
const EMPTY_FORM = {
  name: "",
  category: BUSINESS_CATEGORIES[0],
  location: BUSINESS_LOCATIONS[0],
  domain: "",
  ssm: "",
  email: "",
  phone: "",
  whatsapp: "",
  website: "",
  address: "",
  openingHours: "",
  description: "",
};
const FORM_FIELDS = Object.keys(EMPTY_FORM);

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function BusinessFormDialog({ business, open, onOpenChange, onSaved }) {
  const editing = Boolean(business);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? Object.fromEntries(FORM_FIELDS.map((k) => [k, business[k] ?? ""]))
        : EMPTY_FORM,
    );
  }, [open, editing, business]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateAdminBusiness(business.id, form);
        toast.success(`${form.name} saved`);
      } else {
        await createAdminBusiness(form);
        toast.success(`${form.name} added`);
      }
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit business" : "Add business"}</DialogTitle>
          <DialogDescription>
            {editing ? business.id : "It starts unclaimed (L0), ready to be claimed."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={set("name")} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select className={SELECT_CLASS} value={form.category} onChange={set("category")}>
                {BUSINESS_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {!BUSINESS_CATEGORIES.includes(form.category) && <option>{form.category}</option>}
              </select>
            </Field>
            <Field label="Location">
              <select className={SELECT_CLASS} value={form.location} onChange={set("location")}>
                {BUSINESS_LOCATIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {!BUSINESS_LOCATIONS.includes(form.location) && <option>{form.location}</option>}
              </select>
            </Field>
          </div>
          <Field
            label="Domain"
            hint="A claim from an email at this domain is approved automatically. Leave blank so every claim is reviewed."
          >
            <Input value={form.domain} onChange={set("domain")} placeholder="abri.asia" />
          </Field>
          <Field label="SSM number">
            <Input value={form.ssm} onChange={set("ssm")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="WhatsApp">
              <Input value={form.whatsapp} onChange={set("whatsapp")} />
            </Field>
            <Field label="Website">
              <Input value={form.website} onChange={set("website")} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Opening hours">
            <Input value={form.openingHours} onChange={set("openingHours")} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={set("description")} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

function DeleteDialog({ business, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const { accountsDeleted } = await deleteAdminBusiness(business.id);
      toast.success(
        `${business.name} deleted${accountsDeleted ? ` with ${accountsDeleted} account(s)` : ""}`,
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
    <Dialog open={Boolean(business)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {business?.name}?</DialogTitle>
          <DialogDescription>
            This can&rsquo;t be undone.
            {business?.claimants.length > 0
              ? " These accounts claimed it and will be deleted too, so the same emails can sign up again:"
              : " Nobody has claimed it."}
          </DialogDescription>
        </DialogHeader>
        {business?.claimants.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {business.claimants.map((c) => (
              <li key={c.id}>
                {c.email} <span className="text-muted-foreground">({c.claimStatus})</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminBusinesses() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Text filters are applied after a short pause so each keystroke isn't a
  // request.
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState({ businesses: [], total: 0 });
  const [status, setStatus] = useState("loading");
  const [formFor, setFormFor] = useState(undefined); // undefined closed, null add, object edit
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
      setData(await fetchAdminBusinesses({ ...applied, page, pageSize }));
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
    { label: "Name", filter: textFilter("name") },
    { label: "ID", filter: textFilter("id") },
    {
      label: "Category",
      filter: (
        <select className={SELECT_CLASS} value={filters.category} onChange={setFilter("category")}>
          <option value="">All</option>
          {BUSINESS_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      ),
    },
    {
      label: "Location",
      filter: (
        <select className={SELECT_CLASS} value={filters.location} onChange={setFilter("location")}>
          <option value="">All</option>
          {BUSINESS_LOCATIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      ),
    },
    { label: "Domain", filter: textFilter("domain") },
    { label: "Email", filter: textFilter("email") },
    {
      label: "Level",
      filter: (
        <select
          className={SELECT_CLASS}
          value={filters.verificationLevel}
          onChange={setFilter("verificationLevel")}
        >
          <option value="">All</option>
          {LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      ),
    },
    {
      label: "Claimed by",
      filter: (
        <select className={SELECT_CLASS} value={filters.claimed} onChange={setFilter("claimed")}>
          <option value="">All</option>
          <option value="yes">Claimed</option>
          <option value="no">Unclaimed</option>
        </select>
      ),
    },
    { label: "Updated", filter: null },
    { label: "", filter: null },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Businesses
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Add, edit or delete listings. To test a claim that matches, give the business a
            Domain and claim it with an email at that domain.
          </p>
        </div>
        <Button onClick={() => setFormFor(null)}>
          <Plus className="h-4 w-4" /> Add business
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-left text-sm">
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
              data.businesses.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{b.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.id}</td>
                  <td className="px-3 py-2">{b.category}</td>
                  <td className="px-3 py-2">{b.location}</td>
                  <td className="px-3 py-2">{b.domain ?? "—"}</td>
                  <td className="px-3 py-2">{b.email ?? "—"}</td>
                  <td className="px-3 py-2">{b.verificationLevel}</td>
                  <td className="px-3 py-2">
                    {b.claimants.length === 0
                      ? "—"
                      : b.claimants.map((c) => (
                          <div key={c.id}>
                            {c.email}{" "}
                            <span className="text-xs text-muted-foreground">({c.claimStatus})</span>
                          </div>
                        ))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(b.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${b.name}`} onClick={() => setFormFor(b)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${b.name}`} onClick={() => setDeleting(b)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {status === "loading" && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
        {status === "error" && (
          <p className="p-6 text-sm text-muted-foreground">Couldn&rsquo;t load the businesses.</p>
        )}
        {status === "ready" && data.businesses.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No businesses match these filters.</p>
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

      <BusinessFormDialog
        business={formFor ?? null}
        open={formFor !== undefined}
        onOpenChange={(o) => !o && setFormFor(undefined)}
        onSaved={load}
      />
      <DeleteDialog business={deleting} onClose={() => setDeleting(null)} onDeleted={load} />
    </div>
  );
}

export { AdminBusinesses };
