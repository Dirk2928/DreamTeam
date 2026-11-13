"use client";
import { useState } from "react";
import { Clock3, Pencil, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { categoryColor } from "@/lib/utils";
import type { Category } from "@/lib/types";
import { RoleGuard } from "@/components/role-guard";
import { ApiNotice, Button, Card, Input, LoadingState, PageTitle, Textarea } from "@/components/ui";

export default function CategoriesPage() {
  const result = useApi(() => api.categories.list(true), [], []);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name")), description: String(form.get("description")) || null, sla_hours: Number(form.get("sla_hours")), is_active: editing === "new" ? true : editing?.is_active ?? true };
    setBusy(true);
    setActionError("");
    try {
      if (editing === "new") {
        const created = await api.categories.create(payload);
        result.setData([...result.data, created]);
      } else if (editing) {
        const updated = await api.categories.update(editing.id, payload);
        result.setData(result.data.map((item) => item.id === updated.id ? updated : item));
      }
      setEditing(null);
      toast.success("Category saved");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save the category.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(category: Category) {
    setBusy(true);
    setActionError("");
    try {
      const updated = await api.categories.update(category.id, { name: category.name, description: category.description, sla_hours: category.sla_hours, is_active: !category.is_active });
      result.setData(result.data.map((item) => item.id === updated.id ? updated : item));
      toast.success("Category updated");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the category.");
    } finally {
      setBusy(false);
    }
  }

  return <RoleGuard roles={["admin"]}><PageTitle eyebrow="Administration" title="Complaint categories" description="Define service categories and response windows shown to residents." action={<Button onClick={() => setEditing("new")}><Plus size={17}/> Add category</Button>}/><ApiNotice error={actionError || result.error} retry={result.reload}/>{editing && <Card className="mb-5 p-5"><form onSubmit={save} className="grid items-end gap-4 lg:grid-cols-[1fr_1.3fr_140px_auto]"><label><span className="mb-1.5 block text-sm font-semibold">Name</span><Input name="name" required minLength={2} maxLength={100} defaultValue={editing === "new" ? "" : editing.name} placeholder="e.g. Parks & Trees"/></label><label><span className="mb-1.5 block text-sm font-semibold">Description</span><Textarea name="description" rows={2} defaultValue={editing === "new" ? "" : editing.description ?? ""}/></label><label><span className="mb-1.5 block text-sm font-semibold">SLA (hours)</span><Input name="sla_hours" type="number" min={1} max={8760} defaultValue={editing === "new" ? 48 : editing.sla_hours}/></label><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>Save</Button></div></form></Card>}{result.loading ? <LoadingState/> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{result.data.map((category) => <Card key={category.id} className="p-5"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: categoryColor(category.id) }}><Tag size={20}/></span><button onClick={() => setEditing(category)} className="text-slate-400" aria-label={`Edit ${category.name}`}><Pencil size={17}/></button></div><h2 className="mt-5 font-bold">{category.name}</h2><p className="mt-2 min-h-10 text-sm text-slate-500">{category.description ?? "No description provided."}</p><div className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Clock3 size={15}/>{category.sla_hours} hour response target</div><div className="mt-5 flex items-center justify-between border-t pt-4"><span className={`text-xs font-bold ${category.is_active ? "text-teal-700" : "text-slate-400"}`}>{category.is_active ? "Active" : "Inactive"}</span><button disabled={busy} onClick={() => toggle(category)} className={`relative h-6 w-11 rounded-full transition ${category.is_active ? "bg-teal-600" : "bg-slate-300"}`} aria-label={`${category.is_active ? "Deactivate" : "Activate"} ${category.name}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${category.is_active ? "left-6" : "left-1"}`}/></button></div></Card>)}</div>}</RoleGuard>;
}
