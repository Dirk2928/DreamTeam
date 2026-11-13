"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChartNoAxesCombined, ChevronDown, ClipboardList, FilePlus2, Gauge, Landmark, Layers3, LogOut, Map, Menu, ScrollText, Users, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { RoleGuard } from "./role-guard";
import { AssistantChat } from "./assistant-chat";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

const common = [{ href: "/dashboard", label: "Overview", icon: Gauge }, { href: "/complaints", label: "Complaints", icon: ClipboardList }, { href: "/map", label: "Community map", icon: Map }, { href: "/notifications", label: "Notifications", icon: Bell }];
const byRole: Record<Role, { href: string; label: string; icon: typeof Gauge }[]> = {
  citizen: [{ href: "/complaints/new", label: "Report an issue", icon: FilePlus2 }],
  official: [{ href: "/official", label: "Response queue", icon: Layers3 }],
  admin: [{ href: "/official", label: "Response queue", icon: Layers3 }, { href: "/admin/users", label: "Staff", icon: Users }, { href: "/admin/categories", label: "Categories", icon: Landmark }, { href: "/admin/audit", label: "Audit log", icon: ScrollText }],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = user ? [...(user.role === "citizen" ? byRole.citizen : []), ...common, ...(user.role !== "citizen" ? byRole[user.role] : [])] : [];
  const initials = user?.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2);

  return <RoleGuard><div className="min-h-screen bg-[#f7f9f8]"><aside className={cn("fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-[#0c2723] p-5 text-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}><div className="mb-8 flex items-center justify-between px-2"><Link href="/dashboard" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-teal-400 font-black text-[#0c2723]">P</span><span><strong className="block text-xl tracking-tight">PKonek</strong><small className="text-teal-200/70">Community action</small></span></Link><button onClick={() => setOpen(false)} className="lg:hidden" aria-label="Close navigation"><X/></button></div><nav className="space-y-1">{nav.map(({ href, label, icon: Icon }) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-teal-400 text-[#0c2723]" : "text-slate-300 hover:bg-white/10 hover:text-white")}><Icon size={18}/>{label}</Link>; })}</nav><div className="absolute inset-x-5 bottom-5"><Link href="/reports/public" className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10"><ChartNoAxesCombined size={18}/> Public report</Link><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/10 hover:text-white"><LogOut size={18}/> Sign out</button></div></aside><div className="lg:pl-72"><header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur sm:px-8"><button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu/></button><div className="hidden text-sm text-slate-500 sm:block">Pasig City Operations</div><div className="ml-auto flex items-center gap-3"><Link href="/notifications" className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600"><Bell size={18}/></Link><div className="flex items-center gap-3 rounded-xl p-1.5 pr-2"><span className="grid size-9 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">{initials}</span><span className="hidden text-left sm:block"><b className="block text-sm text-slate-800">{user?.full_name}</b><span className="text-xs capitalize text-slate-500">{user?.role}</span></span><ChevronDown size={14}/></div></div></header><main className="mx-auto max-w-[1500px] p-4 sm:p-8">{children}</main></div>{open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}/>}<AssistantChat/></div></RoleGuard>;
}
