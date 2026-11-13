"use client";
import { useState } from "react";
import { Search, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { RoleGuard } from "@/components/role-guard";
import { ApiNotice, Button, Card, Input, LoadingState, PageTitle, Select } from "@/components/ui";

export default function UsersPage() {
  const result = useApi(() => api.auth.staff(), [], []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setActionError("");
    try {
      const created = await api.auth.createStaff({ full_name: String(form.get("full_name")), email: String(form.get("email")), password: String(form.get("password")), role: form.get("role") as "official" | "admin" });
      result.setData([...result.data, created]);
      setOpen(false);
      toast.success("Staff account created");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create the staff account.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true);
    setActionError("");
    try {
      const updated = await api.auth.setStaffActive(id, !active);
      result.setData(result.data.map((item) => item.id === id ? updated : item));
      toast.success(active ? "Account suspended" : "Account activated");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the account.");
    } finally {
      setBusy(false);
    }
  }

  const shown = result.data.filter((item) => `${item.full_name} ${item.email}`.toLowerCase().includes(search.toLowerCase()));
  return <RoleGuard roles={["admin"]}><PageTitle eyebrow="Administration" title="Staff accounts" description="Create official and administrator accounts and manage platform access." action={<Button onClick={() => setOpen(true)}><UserPlus size={17}/> Add staff</Button>}/><ApiNotice error={actionError || result.error} retry={result.reload}/><div className="mb-5 grid gap-4 sm:grid-cols-2"><Card className="p-5"><UsersRound className="text-teal-700"/><b className="mt-4 block text-2xl">{result.data.length}</b><span className="text-sm text-slate-500">Total staff</span></Card><Card className="p-5"><ShieldCheck className="text-violet-700"/><b className="mt-4 block text-2xl">{result.data.filter((item) => item.role === "official" && item.is_active).length}</b><span className="text-sm text-slate-500">Active officials</span></Card></div><Card className="overflow-hidden"><div className="border-b p-4"><label className="relative block max-w-sm"><Search className="absolute left-3 top-3.5 text-slate-400" size={16}/><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff..."/></label></div>{result.loading ? <LoadingState/> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Person</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y">{shown.map((item) => <tr key={item.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-teal-100 font-bold text-teal-800">{item.full_name[0]}</span><span><b className="block">{item.full_name}</b><small className="text-slate-400">{item.email}</small></span></div></td><td className="px-5 py-4 capitalize">{item.role}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.is_active ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}>{item.is_active ? "Active" : "Suspended"}</span></td><td className="px-5 py-4 text-right"><button disabled={busy} onClick={() => toggle(item.id, item.is_active)} className="font-semibold text-slate-500 hover:text-teal-700">{item.is_active ? "Suspend" : "Activate"}</button></td></tr>)}</tbody></table></div>}</Card>{open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><Card className="w-full max-w-lg p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Create staff account</h2><button onClick={() => setOpen(false)} aria-label="Close"><X/></button></div>{actionError && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}<form onSubmit={create} className="mt-5 space-y-4"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Full name</span><Input name="full_name" minLength={2} maxLength={160} required/></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Government email</span><Input name="email" type="email" required/></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Temporary password</span><Input name="password" type="password" minLength={8} maxLength={128} required/></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Role</span><Select name="role"><option value="official">Official</option><option value="admin">Administrator</option></Select></label><div className="flex justify-end gap-2 pt-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>Create staff</Button></div></form></Card></div>}</RoleGuard>;
}
