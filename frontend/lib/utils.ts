import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComplaintStatus, Severity } from "./types";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatDate(value: string) { return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
export function formatShortDate(value: string) { return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(value)); }
export function statusLabel(status: ComplaintStatus) { return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
export function complaintReference(id: string) { return `PKN-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`; }

const categoryPalette = ["#f97316", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
export function categoryColor(value: string) {
  const hash = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
  return categoryPalette[hash % categoryPalette.length];
}

export const statusStyles: Record<ComplaintStatus, string> = {
  submitted: "bg-sky-50 text-sky-700 ring-sky-200",
  acknowledged: "bg-violet-50 text-violet-700 ring-violet-200",
  assigned: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  in_progress: "bg-amber-50 text-amber-800 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending_verification: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  closed: "bg-teal-50 text-teal-700 ring-teal-200",
  reopened: "bg-rose-50 text-rose-700 ring-rose-200",
  rejected: "bg-slate-100 text-slate-600 ring-slate-200",
};
export const severityStyles: Record<Severity, string> = { low: "text-slate-600 bg-slate-100", medium: "text-amber-700 bg-amber-50", high: "text-orange-700 bg-orange-50", critical: "text-rose-700 bg-rose-50" };
