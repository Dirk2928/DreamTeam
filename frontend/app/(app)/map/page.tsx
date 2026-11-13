"use client";
import { Flame, Layers3, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ApiNotice, Card, Input, LoadingState, PageTitle } from "@/components/ui";
import { PKonekMap } from "@/components/pkonek-map";

export default function MapPage() {
  const markerResult = useApi(() => api.public.markers(), [], []);
  const hotspotResult = useApi(() => api.public.hotspots(), [], []);
  const [showHotspots, setShowHotspots] = useState(true);
  const [search, setSearch] = useState("");
  const markers = useMemo(() => markerResult.data.filter((item) => !search || item.title.toLowerCase().includes(search.toLowerCase())), [markerResult.data, search]);
  return <div><PageTitle eyebrow="Pasig area intelligence" title="Community issue map" description="See active reports and identify areas needing coordinated action across Pasig City."/><ApiNotice error={markerResult.error || hotspotResult.error} retry={() => { markerResult.reload(); hotspotResult.reload(); }}/>{markerResult.loading || hotspotResult.loading ? <LoadingState/> : <div className="relative"><PKonekMap complaints={markers} hotspots={showHotspots ? hotspotResult.data : []} className="h-[calc(100vh-230px)] min-h-[520px]"/><Card className="absolute left-4 right-4 top-4 z-[500] flex gap-2 p-2 md:right-auto md:w-[370px]"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><Input className="h-10 border-0 bg-slate-50 pl-9" placeholder="Search report title" value={search} onChange={(event) => setSearch(event.target.value)}/></div><button onClick={() => setShowHotspots(!showHotspots)} className={`rounded-lg px-3 ${showHotspots ? "bg-rose-50 text-rose-700" : "text-slate-500"}`} title="Toggle hotspots"><Flame size={18}/></button></Card><Card className="absolute bottom-5 left-5 z-[500] hidden p-4 sm:block"><b className="flex items-center gap-2 text-sm"><Layers3 size={16}/> Map legend</b><div className="mt-3 space-y-2 text-xs text-slate-600"><span className="flex items-center gap-2"><i className="size-3 rounded-full bg-rose-500"/> Critical report</span><span className="flex items-center gap-2"><i className="size-3 rounded-full bg-teal-600"/> Community report</span><span className="flex items-center gap-2"><i className="size-3 rounded-full border-2 border-dashed border-amber-500"/> Issue hotspot</span></div></Card><Card className="absolute bottom-5 right-5 z-[500] hidden max-w-xs p-4 lg:block"><div className="flex items-center gap-2 text-rose-700"><Flame size={18}/><b>{hotspotResult.data.length} active hotspots</b></div><p className="mt-1 text-xs leading-5 text-slate-500">Hotspots group reports that may need a coordinated response.</p></Card></div>}</div>;
}
