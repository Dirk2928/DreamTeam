"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Image as ImageIcon, LoaderCircle, MapPin, ScanSearch, Send, ShieldCheck, ThumbsDown, ThumbsUp, Upload, UsersRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { categoryColor, complaintReference, formatDate, statusLabel } from "@/lib/utils";
import type { Category, Complaint, ComplaintStatus, EvidenceAssessment, User } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { ApiNotice, Button, Card, LoadingState, Select, SeverityBadge, StatusBadge, Textarea } from "@/components/ui";
import { PKonekMap } from "@/components/pkonek-map";
import { AuthenticatedPhoto } from "@/components/authenticated-photo";

const transitions: Record<ComplaintStatus, ComplaintStatus[]> = {
  submitted: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "rejected"],
  assigned: ["in_progress", "rejected"],
  in_progress: ["resolved", "rejected"],
  resolved: ["pending_verification"],
  pending_verification: [],
  closed: [],
  reopened: ["in_progress", "resolved", "rejected"],
  rejected: ["reopened"],
};

export default function ComplaintDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const result = useApi<Complaint | null>(() => api.complaints.get(params.id), null, [params.id]);
  const photoResult = useApi(() => api.complaints.photos(params.id), [], [params.id]);
  const updateResult = useApi(() => api.complaints.updates(params.id), [], [params.id]);
  const categoryResult = useApi<Category[]>(() => api.categories.list(), [], []);
  const staffResult = useApi<User[]>(() => user?.role === "citizen" ? Promise.resolve([]) : api.auth.staff(), [], [user?.role]);
  const [statusChoice, setStatusChoice] = useState<ComplaintStatus | null>(null);
  const [assigneeChoice, setAssigneeChoice] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [update, setUpdate] = useState("");
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [evidence, setEvidence] = useState<EvidenceAssessment | null>(null);

  const item = result.data;

  if (result.loading) return <LoadingState/>;
  if (!item) return <div><ApiNotice error={result.error ?? "Complaint not found."} retry={result.reload}/></div>;
  const complaint = item;

  const category = categoryResult.data.find((entry) => entry.id === complaint.category_id);
  const status = statusChoice ?? complaint.status;
  const assignee = assigneeChoice ?? complaint.assigned_to ?? "";
  const assignedUser = staffResult.data.find((entry) => entry.id === complaint.assigned_to);
  const beforePhotos = photoResult.data.filter((photo) => photo.kind === "before");
  const afterPhotos = photoResult.data.filter((photo) => photo.kind === "after");
  const canManage = user?.role === "official" || user?.role === "admin";
  const canVerify = user?.role === "citizen" && complaint.citizen_id === user.id && complaint.status === "pending_verification";
  const canSupport = user?.role === "citizen" && complaint.citizen_id !== user.id && ["submitted", "acknowledged", "assigned", "in_progress", "reopened"].includes(complaint.status);

  async function supportComplaint() {
    setUpdating(true);
    setActionError("");
    try {
      await api.complaints.meToo(complaint.id);
      toast.success("You were added to this report");
      result.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not add your support.");
    } finally {
      setUpdating(false);
    }
  }

  async function saveWorkflow() {
    const assigneeChanged = assignee && assignee !== complaint.assigned_to;
    const statusChanged = status !== complaint.status;
    if (statusChanged && workflowMessage.trim().length < 2) return setActionError("Add a public message explaining the status change.");
    if (!assigneeChanged && !statusChanged) return;
    setUpdating(true);
    setActionError("");
    try {
      let current = complaint;
      if (assigneeChanged) current = await api.complaints.assign(complaint.id, assignee);
      if (status !== current.status) await api.complaints.status(complaint.id, status, workflowMessage.trim());
      toast.success("Workflow updated");
      setWorkflowMessage("");
      setStatusChoice(null);
      setAssigneeChoice(null);
      result.reload();
      updateResult.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the workflow.");
    } finally {
      setUpdating(false);
    }
  }

  async function addUpdate() {
    if (update.trim().length < 2) return;
    setUpdating(true);
    setActionError("");
    try {
      await api.complaints.addUpdate(complaint.id, update.trim());
      setUpdate("");
      toast.success("Public update posted");
      updateResult.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not post the update.");
    } finally {
      setUpdating(false);
    }
  }

  async function verify(accepted: boolean) {
    setUpdating(true);
    setActionError("");
    try {
      await api.complaints.verify(complaint.id, accepted, accepted ? "Issue is resolved" : "Issue still needs attention");
      toast.success(accepted ? "Resolution confirmed" : "Report reopened for further action");
      result.reload();
      updateResult.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not submit verification.");
    } finally {
      setUpdating(false);
    }
  }

  async function uploadAfterPhoto() {
    if (!afterPhoto) return;
    setUpdating(true);
    setActionError("");
    try {
      await api.complaints.uploadPhoto(complaint.id, afterPhoto, "after");
      setAfterPhoto(null);
      toast.success("After photo uploaded");
      photoResult.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not upload the photo.");
    } finally {
      setUpdating(false);
    }
  }

  async function assessEvidence() {
    setUpdating(true);
    setActionError("");
    try {
      const response = await api.complaints.assessEvidence(complaint.id);
      setEvidence(response);
      toast.success("Evidence and hotspot assessment complete");
      result.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not assess the report evidence.");
    } finally {
      setUpdating(false);
    }
  }

  return <div><Link href="/complaints" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-teal-700"><ArrowLeft size={16}/> Back to complaints</Link><ApiNotice error={actionError || result.error || photoResult.error || updateResult.error} retry={() => { result.reload(); photoResult.reload(); updateResult.reload(); }}/><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="space-y-5"><Card className="overflow-hidden"><div className="h-2" style={{ background: categoryColor(complaint.category_id) }}/><div className="p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-teal-700">{complaintReference(complaint.id)}</span><StatusBadge status={complaint.status}/><SeverityBadge severity={complaint.severity}/></div><h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{complaint.title}</h1><div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500"><span className="flex items-center gap-1.5"><MapPin size={16}/>{complaint.address ?? "Pasig City"}</span><span className="flex items-center gap-1.5"><Clock3 size={16}/>{formatDate(complaint.created_at)}</span></div><p className="mt-6 whitespace-pre-wrap leading-7 text-slate-600">{complaint.description}</p><div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><span className="flex items-center gap-2 text-sm text-slate-600"><UsersRound size={18} className="text-teal-700"/><b>{complaint.me_too_count}</b> residents are affected</span>{canSupport && <Button variant="secondary" disabled={updating} onClick={supportComplaint}><UsersRound size={16}/> Me Too</Button>}</div></div></Card>
    {(beforePhotos.length > 0 || afterPhotos.length > 0) && <Card className="p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Before and after</h2><p className="mt-1 text-sm text-slate-500">Visual evidence of the reported issue and completed work.</p></div><div className="flex gap-2">{canManage && beforePhotos[0] && <Button onClick={assessEvidence} disabled={updating}><ScanSearch size={16}/>{updating ? "Analyzing..." : "Run staff AI review"}</Button>}</div></div><div className="mt-4 grid gap-4 sm:grid-cols-2">{[["Before", beforePhotos[0]], ["After", afterPhotos[0]]].map(([label, photo]) => <div key={String(label)}><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">{String(label)}</span>{photo && typeof photo !== "string" ? <AuthenticatedPhoto photo={photo} alt={`${label} evidence`} className="h-56 w-full rounded-xl object-cover"/> : <div className="grid h-56 place-items-center rounded-xl bg-slate-100 text-slate-400"><ImageIcon/></div>}</div>)}</div>{canManage && evidence && <div className="mt-5 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 p-4"><div className="flex items-center gap-2"><ShieldCheck className="text-violet-700" size={20}/><div><b className="block text-sm">AI evidence & hotspot review</b><span className="text-xs text-slate-500">Staff-only decision support</span></div></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${evidence.verdict === "consistent" ? "bg-emerald-100 text-emerald-800" : evidence.verdict === "needs_review" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{evidence.verdict.replace("_", " ")}</span><SeverityBadge severity={evidence.severity}/></div></div><div className="grid gap-3 p-4 sm:grid-cols-2"><div className="rounded-xl bg-white p-3 shadow-sm"><span className="text-xs font-bold uppercase tracking-wide text-slate-400">Combined severity</span><div className="mt-2 flex items-end justify-between"><b className="text-2xl capitalize">{evidence.severity}</b><span className="font-bold text-violet-700">{Math.round(evidence.score * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full bg-violet-600" style={{width:`${Math.round(evidence.score * 100)}%`}}/></div><p className="mt-2 text-xs text-slate-500">Written {Math.round(evidence.components.written_report * 100)}% · Image {evidence.components.image === null ? "unavailable" : `${Math.round(evidence.components.image * 100)}%`} · Density {Math.round(evidence.components.hotspot_density * 100)}%</p></div><div className="rounded-xl bg-white p-3 shadow-sm"><span className="text-xs font-bold uppercase tracking-wide text-slate-400">250m hotspot</span><div className="mt-2 grid grid-cols-2 gap-2"><div><b className="text-2xl">{evidence.hotspot.pins}</b><span className="block text-xs text-slate-500">nearby pins</span></div><div><b className="text-2xl">{evidence.hotspot.supporters}</b><span className="block text-xs text-slate-500">supporters</span></div></div></div><div className="rounded-xl bg-white p-3 shadow-sm"><span className="text-xs font-bold uppercase tracking-wide text-slate-400">Report match</span><p className="mt-2 text-sm"><b>Reported:</b> {evidence.report_match.expected_category}</p><p className="text-sm"><b>Detected:</b> {evidence.report_match.detected_category ?? "Image analysis unavailable"}</p>{evidence.report_match.confidence !== null && <p className="mt-1 text-xs text-slate-500">Visual confidence {Math.round(evidence.report_match.confidence * 100)}%</p>}</div><div className="rounded-xl bg-white p-3 shadow-sm"><span className="text-xs font-bold uppercase tracking-wide text-slate-400">OCR scan</span><p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-sm text-slate-700">{evidence.ocr.text || "No readable text found."}</p><p className="mt-1 text-xs text-slate-500">{evidence.ocr.engine ?? "Unavailable"} · term match {Math.round(evidence.ocr.term_match * 100)}%</p></div></div>{evidence.warnings.length > 0 && <div className="mx-4 mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>Review notes</b><ul className="mt-1 list-disc pl-4">{evidence.warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul></div>}<p className="border-t border-violet-100 px-4 py-3 text-xs leading-5 text-slate-500">{evidence.disclaimer}</p></div>}</Card>}
    <Card className="p-5 sm:p-7"><h2 className="text-lg font-bold">Progress timeline</h2><div className="mt-6 space-y-0">{[{ id: `created-${complaint.id}`, message: "Report submitted to PKonek", new_status: "submitted" as ComplaintStatus, created_at: complaint.created_at, author_id: complaint.citizen_id }, ...updateResult.data].map((event, index) => { const author = staffResult.data.find((staff) => staff.id === event.author_id)?.full_name ?? (event.author_id === user?.id ? user.full_name : "PKonek user"); return <div key={event.id} className="relative flex gap-4 pb-7 last:pb-0"><div className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700 ring-4 ring-white"><CheckCircle2 size={17}/></div>{index < updateResult.data.length && <div className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-200"/>}<div><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{event.new_status ? statusLabel(event.new_status) : "Update"}</b><span className="text-xs text-slate-400">{formatDate(event.created_at)}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{event.message}</p><span className="mt-1 text-xs text-slate-400">by {author}</span></div></div>; })}</div></Card>
    {canManage && <Card className="p-5 sm:p-7"><h2 className="font-bold">Post a public update</h2><p className="mt-1 text-sm text-slate-500">Residents following this report will be notified.</p><Textarea className="mt-4" rows={4} value={update} onChange={(event) => setUpdate(event.target.value)} placeholder="Share what was inspected, scheduled, or completed..."/><div className="mt-3 flex justify-end"><Button onClick={addUpdate} disabled={updating || update.trim().length < 2}><Send size={16}/> Publish update</Button></div></Card>}</div>
    <aside className="space-y-5">{canManage && <Card className="p-5"><h2 className="font-bold">Manage response</h2><div className="mt-4 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">STATUS</span><Select value={status} onChange={(event) => setStatusChoice(event.target.value as ComplaintStatus)}><option value={complaint.status}>{statusLabel(complaint.status)}</option>{transitions[complaint.status].filter((entry) => entry !== complaint.status).map((entry) => <option value={entry} key={entry}>{statusLabel(entry)}</option>)}</Select></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">ASSIGN TO</span><Select value={assignee} onChange={(event) => setAssigneeChoice(event.target.value)}><option value="">Unassigned</option>{staffResult.data.filter((staff) => staff.is_active).map((staff) => <option key={staff.id} value={staff.id}>{staff.full_name}</option>)}</Select></label>{status !== complaint.status && <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-500">PUBLIC STATUS MESSAGE</span><Textarea rows={3} value={workflowMessage} onChange={(event) => setWorkflowMessage(event.target.value)} placeholder="Explain what changed..."/></label>}<Button className="w-full" disabled={updating} onClick={saveWorkflow}>{updating && <LoaderCircle size={16} className="animate-spin"/>} Save workflow</Button></div><div className="mt-5 border-t pt-5"><label className="block text-xs font-bold text-slate-500">AFTER PHOTO</label><input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" onChange={(event) => setAfterPhoto(event.target.files?.[0] ?? null)}/><Button className="mt-3 w-full" variant="secondary" disabled={!afterPhoto || updating} onClick={uploadAfterPhoto}><Upload size={16}/> Upload evidence</Button></div></Card>}
    {canVerify && <Card className="border-teal-200 bg-teal-50 p-5"><CheckCircle2 className="text-teal-700"/><h2 className="mt-3 font-bold text-teal-950">Is this issue resolved?</h2><p className="mt-1 text-sm leading-6 text-teal-800">Your confirmation closes the loop and makes the outcome part of the public record.</p><div className="mt-4 grid grid-cols-2 gap-2"><Button disabled={updating} onClick={() => verify(true)}><ThumbsUp size={15}/> Yes</Button><Button disabled={updating} variant="secondary" onClick={() => verify(false)}><ThumbsDown size={15}/> Not yet</Button></div></Card>}
    <Card className="overflow-hidden"><PKonekMap complaints={[item]} className="h-[260px]"/><div className="p-4"><p className="flex items-start gap-2 text-sm text-slate-600"><MapPin className="mt-0.5 shrink-0 text-teal-700" size={17}/>{complaint.address ?? "Pasig City"}</p></div></Card><Card className="p-5"><h2 className="font-bold">Report details</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Category</dt><dd className="text-right font-semibold">{category?.name ?? complaint.category_id}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">SLA deadline</dt><dd className="text-right font-semibold">{formatDate(complaint.sla_deadline)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Assigned to</dt><dd className="font-semibold">{assignedUser?.full_name ?? "Not yet assigned"}</dd></div></dl></Card><Card className="border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="shrink-0 text-amber-700" size={20}/><p className="text-xs leading-5 text-amber-800"><b className="block">Emergency?</b>PKonek does not replace emergency services. Call 911 for immediate danger.</p></div></Card></aside></div></div>;
}
