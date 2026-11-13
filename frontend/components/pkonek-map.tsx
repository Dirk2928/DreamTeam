"use client";
import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";
import type { Complaint, Hotspot, PublicMarker } from "@/lib/types";

const DynamicMap = dynamic(() => import("./map-core").then((mod) => mod.MapCore), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-2xl bg-slate-100 text-slate-500"><LoaderCircle className="animate-spin"/></div>,
});

export function PKonekMap(props: { complaints?: (Complaint | PublicMarker)[]; hotspots?: Hotspot[]; selected?: { lat: number; lng: number }; onPick?: (lat: number, lng: number) => void; className?: string }) {
  return <DynamicMap {...props}/>;
}
