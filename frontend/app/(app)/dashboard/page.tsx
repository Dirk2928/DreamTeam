"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, FilePlus2, Inbox, MapPin, Siren, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { complaintReference, formatShortDate } from "@/lib/utils";
import type { Complaint, DashboardResponse, DashboardStats } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ApiNotice, Card, LoadingState, PageTitle, SeverityBadge, StatusBadge } from "@/components/ui";
import { CategoryChart, TrendChart } from "@/components/dashboard-charts";

const emptyStats: DashboardStats = { total: 0, open: 0, resolved: 0, avg_resolution_hours: null, avg_first_response_hours: null, resolution_rate: 0, sla_breached: 0, by_status: [], by_category: [], trend: [] };

function trendFrom(complaints: Complaint[]) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return {
      date: new Intl.DateTimeFormat("en-PH", { weekday: "short" }).format(date),
      submitted: complaints.filter((item) => { const value = new Date(item.created_at); return value >= date && value < next; }).length,
      resolved: complaints.filter((item) => { if (!item.resolved_at) return false; const value = new Date(item.resolved_at); return value >= date && value < next; }).length,
    };
  });
}

function citizenStats(complaints: Complaint[], categories: { id: string; name: string }[]): DashboardStats {
  const closed = complaints.filter((item) => item.status === "closed").length;
  const byStatus = Object.entries(complaints.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {})).map(([name, value]) => ({ name: name.replaceAll("_", " "), value }));
  const byCategory = Object.entries(complaints.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.category_id]: (counts[item.category_id] ?? 0) + 1 }), {})).map(([id, value]) => ({ name: categories.find((category) => category.id === id)?.name ?? "Other", value }));
  return { total: complaints.length, open: complaints.length - closed, resolved: closed, avg_resolution_hours: null, avg_first_response_hours: null, resolution_rate: complaints.length ? Math.round((closed / complaints.length) * 1000) / 10 : 0, sla_breached: complaints.filter((item) => new Date(item.sla_deadline).getTime() < Date.now() && !["closed", "rejected"].includes(item.status)).length, by_status: byStatus, by_category: byCategory, trend: trendFrom(complaints) };
}

function staffStats(dashboard: DashboardResponse, complaints: Complaint[]): DashboardStats {
  return { total: dashboard.totals.all, open: dashboard.totals.active, resolved: dashboard.totals.closed, avg_resolution_hours: dashboard.average_resolution_hours, avg_first_response_hours: dashboard.average_first_response_hours, resolution_rate: dashboard.totals.all ? Math.round((dashboard.totals.closed / dashboard.totals.all) * 1000) / 10 : 0, sla_breached: dashboard.sla_breached, by_status: Object.entries(dashboard.by_status).map(([name, value]) => ({ name: name.replaceAll("_", " "), value })), by_category: dashboard.by_category.map((item) => ({ name: item.category, value: item.count })), trend: trendFrom(complaints) };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const result = useApi(async () => {
    if (!user) return { stats: emptyStats, complaints: [] as Complaint[] };
    const [complaints, categories] = await Promise.all([api.complaints.list({ limit: 100, mine: user.role === "citizen" }), api.categories.list()]);
    if (user.role === "citizen") return { stats: citizenStats(complaints, categories), complaints };
    const dashboard = await api.dashboard();
    return { stats: staffStats(dashboard, complaints), complaints };
  }, { stats: emptyStats, complaints: [] as Complaint[] }, [user?.id, user?.role]);
  const stats = result.data.stats;
  const firstName = user?.full_name.split(" ")[0];
  const cards = [{ label: user?.role === "citizen" ? "My reports" : "Total reports", value: stats.total, icon: Inbox, tone: "bg-sky-50 text-sky-700" }, { label: "Open issues", value: stats.open, icon: Clock3, tone: "bg-amber-50 text-amber-700" }, { label: "Resolved", value: stats.resolved, icon: CheckCircle2, tone: "bg-teal-50 text-teal-700" }, { label: "Resolution rate", value: `${stats.resolution_rate}%`, icon: TrendingUp, tone: "bg-violet-50 text-violet-700" }];

  return <div><PageTitle eyebrow={`${user?.role ?? "user"} workspace`} title={`Good day, ${firstName ?? "neighbor"}.`} description={user?.role === "citizen" ? "Track your concerns and see how your community is improving." : "Review the latest service delivery activity across Pasig City."} action={user?.role === "citizen" ? <Link href="/complaints/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white"><FilePlus2 size={18}/> Report an issue</Link> : undefined}/><ApiNotice error={result.error} retry={result.reload}/>{result.loading ? <LoadingState/> : <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><b className="mt-2 block text-3xl tracking-tight">{value}</b></div><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon size={20}/></span></div></Card>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]"><Card className="p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Reports and resolutions</h2><p className="text-xs text-slate-500">Last 7 days</p></div><div className="flex gap-3 text-xs"><span className="text-teal-700">● Submitted</span><span className="text-amber-600">● Resolved</span></div></div><TrendChart data={stats.trend}/></Card><Card className="p-5"><h2 className="font-bold">Issues by category</h2><p className="text-xs text-slate-500">Current reporting mix</p><CategoryChart data={stats.by_category}/></Card></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]"><Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold">Priority reports</h2><p className="text-xs text-slate-500">Items needing attention</p></div><Link href="/complaints" className="flex items-center gap-1 text-sm font-semibold text-teal-700">View all <ArrowRight size={15}/></Link></div><div className="divide-y divide-slate-100">{result.data.complaints.filter((item) => !["closed", "rejected"].includes(item.status)).slice(0, 4).map((item) => <Link key={item.id} href={`/complaints/${item.id}`} className="grid gap-3 p-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-bold text-teal-700">{complaintReference(item.id)}</span><SeverityBadge severity={item.severity}/></div><p className="mt-1 truncate font-semibold text-slate-800">{item.title}</p><span className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin size={12}/>{item.address ?? "Pasig City"} · {formatShortDate(item.created_at)}</span></div><StatusBadge status={item.status}/></Link>)}</div></Card><Card className="bg-[#0c2723] p-6 text-white"><Siren className="text-teal-300"/><h2 className="mt-8 text-xl font-bold">Community response pulse</h2><p className="mt-2 text-sm leading-6 text-teal-100/70">{stats.sla_breached} active reports are currently past their service deadline.</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/10 p-4"><span className="text-xs text-teal-100/60">First response</span><b className="block text-2xl">{user?.role === "citizen" || stats.avg_first_response_hours === null ? "—" : `${stats.avg_first_response_hours}h`}</b></div><div className="rounded-xl bg-white/10 p-4"><span className="text-xs text-teal-100/60">Resolution</span><b className="block text-2xl">{stats.avg_resolution_hours === null ? "—" : `${stats.avg_resolution_hours}h`}</b></div></div></Card></div></>}</div>;
}
