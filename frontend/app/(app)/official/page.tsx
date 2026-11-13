"use client";
import Link from "next/link";
import { Clock3, MapPin, UsersRound } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { complaintReference, formatDate } from "@/lib/utils";
import { ApiNotice, Card, LoadingState, PageTitle, SeverityBadge, StatusBadge } from "@/components/ui";
import { RoleGuard } from "@/components/role-guard";

const filters = ["All active", "Critical", "Unassigned", "Past SLA"] as const;
export default function OfficialQueuePage() {
  const result = useApi(() => api.complaints.list({ limit: 100 }), [], []);
  const staffResult = useApi(() => api.auth.staff(), [], []);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All active");
  const [now] = useState(() => Date.now());
  const queue = result.data.filter((item) => item.status !== "closed" && item.status !== "rejected").filter((item) => filter === "All active" || (filter === "Critical" && item.severity === "critical") || (filter === "Unassigned" && !item.assigned_to) || (filter === "Past SLA" && new Date(item.sla_deadline).getTime() < now));

  return <RoleGuard roles={["official", "admin"]}><PageTitle eyebrow="Field operations" title="Response queue" description="Triage reports, assign responders, and publish clear updates for residents."/><ApiNotice error={result.error || staffResult.error} retry={() => { result.reload(); staffResult.reload(); }}/><div className="mb-5 flex gap-2 overflow-auto pb-1">{filters.map((value) => <button onClick={() => setFilter(value)} key={value} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${filter === value ? "bg-[#0c2723] text-white" : "border bg-white text-slate-600"}`}>{value}</button>)}</div>{result.loading ? <LoadingState/> : <div className="space-y-3">{queue.map((item) => <Link href={`/complaints/${item.id}`} key={item.id}><Card className="mb-3 grid gap-5 p-5 transition hover:border-teal-300 hover:shadow-md lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><b className="text-xs text-teal-700">{complaintReference(item.id)}</b><SeverityBadge severity={item.severity}/><StatusBadge status={item.status}/></div><h2 className="mt-2 text-lg font-bold text-slate-900">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><MapPin size={14}/>{item.address ?? "Pasig City"}</span><span className="flex items-center gap-1"><Clock3 size={14}/>{formatDate(item.created_at)}</span><span className="flex items-center gap-1"><UsersRound size={14}/>{item.me_too_count} affected</span></div></div><div className="text-right"><span className="text-xs text-slate-400">Assigned to</span><p className="mt-1 text-sm font-semibold">{staffResult.data.find((staff) => staff.id === item.assigned_to)?.full_name ?? "Unassigned"}</p></div></Card></Link>)}</div>}{!result.loading && queue.length === 0 && <p className="py-16 text-center text-slate-500">No reports match this queue filter.</p>}</RoleGuard>;
}
