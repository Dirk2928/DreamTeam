"use client";
import { Download, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";
import { RoleGuard } from "@/components/role-guard";
import { ApiNotice, Button, Card, Input, LoadingState, PageTitle } from "@/components/ui";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
export default function AuditPage() {
  const result = useApi(() => api.auditLogs(), [], []);
  const [search, setSearch] = useState("");
  const shown = useMemo(() => result.data.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [result.data, search]);
  function exportLog() {
    const rows = [["created_at", "actor_id", "action", "entity_type", "entity_id", "ip_address"], ...shown.map((item) => [item.created_at, item.actor_id, item.action, item.entity_type, item.entity_id, item.ip_address])];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "pkonek-audit-log.csv";
    link.click();
    URL.revokeObjectURL(href);
  }
  return <RoleGuard roles={["admin"]}><PageTitle eyebrow="Administration" title="Audit log" description="A traceable record of account, workflow, and configuration changes." action={<Button variant="secondary" onClick={exportLog} disabled={!shown.length}><Download size={17}/> Export log</Button>}/><ApiNotice error={result.error} retry={result.reload}/><Card className="overflow-hidden"><div className="flex items-center justify-between gap-3 border-b p-4"><label className="relative block w-full max-w-sm"><Search className="absolute left-3 top-3.5 text-slate-400" size={16}/><Input className="pl-9" placeholder="Search actions or IDs..." value={search} onChange={(event) => setSearch(event.target.value)}/></label><ShieldCheck className="text-teal-700"/></div>{result.loading ? <LoadingState/> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">When</th><th className="px-5 py-3">Actor ID</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Entity</th><th className="px-5 py-3">IP address</th></tr></thead><tbody className="divide-y">{shown.map((item) => <tr key={item.id}><td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(item.created_at)}</td><td className="px-5 py-4 font-mono text-xs">{item.actor_id ?? "System"}</td><td className="px-5 py-4 font-semibold">{item.action}</td><td className="px-5 py-4 text-slate-500">{item.entity_type}{item.entity_id ? ` · ${item.entity_id}` : ""}</td><td className="px-5 py-4 font-mono text-xs text-slate-400">{item.ip_address ?? "—"}</td></tr>)}</tbody></table></div>}</Card></RoleGuard>;
}
