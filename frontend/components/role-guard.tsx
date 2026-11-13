"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { LoaderCircle } from "lucide-react";
export function RoleGuard({ children, roles }: { children: React.ReactNode; roles?: Role[] }) { const { user, loading } = useAuth(); const router = useRouter(); useEffect(() => { if (!loading && !user) router.replace("/login"); else if (!loading && user && roles && !roles.includes(user.role)) router.replace("/dashboard"); }, [loading, user, roles, router]); if (loading || !user || (roles && !roles.includes(user.role))) return <div className="grid min-h-screen place-items-center"><LoaderCircle className="animate-spin text-teal-600" /></div>; return children; }
