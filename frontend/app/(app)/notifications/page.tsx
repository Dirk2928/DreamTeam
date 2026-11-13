"use client";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";
import { ApiNotice, Button, Card, LoadingState, PageTitle } from "@/components/ui";
import { toast } from "sonner";

export default function NotificationsPage() {
  const router = useRouter();
  const result = useApi(() => api.notifications.list(), [], []);
  async function markRead(id: string) {
    try {
      await api.notifications.markRead(id);
      result.setData(result.data.map((item) => item.id === id ? { ...item, is_read: true } : item));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark the notification as read.");
      throw err;
    }
  }
  async function readAll() {
    try {
      await api.notifications.readAll();
      result.setData(result.data.map((item) => ({ ...item, is_read: true })));
      toast.success("All notifications marked read");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark notifications as read.");
    }
  }
  async function openNotification(id: string, complaintId: string | null) {
    const item = result.data.find((entry) => entry.id === id);
    if (item && !item.is_read) {
      try { await markRead(id); } catch { return; }
    }
    if (complaintId) router.push(`/complaints/${complaintId}`);
  }
  return <div><PageTitle eyebrow="Inbox" title="Notifications" description="Updates on reports you submitted, follow, or manage." action={<Button variant="secondary" onClick={readAll} disabled={!result.data.some((item) => !item.is_read)}><CheckCheck size={17}/> Mark all read</Button>}/><ApiNotice error={result.error} retry={result.reload}/>{result.loading ? <LoadingState/> : <Card className="divide-y divide-slate-100 overflow-hidden">{result.data.map((item) => <button onClick={() => openNotification(item.id, item.complaint_id)} key={item.id} className={`flex w-full gap-4 p-5 text-left transition hover:bg-slate-50 ${!item.is_read ? "bg-teal-50/40" : ""}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${!item.is_read ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"}`}><ClipboardCheck size={19}/></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="text-sm text-slate-900">{item.title}</b>{!item.is_read && <span className="size-2 rounded-full bg-teal-500"/>}</div><p className="mt-1 text-sm text-slate-600">{item.body}</p><span className="mt-2 block text-xs text-slate-400">{formatDate(item.created_at)}</span></div></button>)}{!result.data.length && <div className="py-20 text-center"><Bell className="mx-auto text-slate-300"/><p className="mt-3 text-sm text-slate-500">You’re all caught up.</p></div>}</Card>}</div>;
}
