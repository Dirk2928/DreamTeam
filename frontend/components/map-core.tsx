"use client";
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { Complaint, Hotspot, PublicMarker } from "@/lib/types";
import { PASIG_BOUNDS, PASIG_CENTER } from "@/lib/pasig";
import { categoryColor, complaintReference } from "@/lib/utils";

const pin = L.divIcon({ className: "", html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0f766e;border:3px solid white;box-shadow:0 2px 8px #0004"><div style="width:7px;height:7px;border-radius:50%;background:white;margin:7px"></div></div>', iconSize: [28, 28], iconAnchor: [14, 28] });
function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) { useMapEvents({ click(event) { onPick(event.latlng.lat, event.latlng.lng); } }); return null; }

export function MapCore({ complaints = [], hotspots = [], selected, onPick, className = "h-[520px]" }: { complaints?: (Complaint | PublicMarker)[]; hotspots?: Hotspot[]; selected?: { lat: number; lng: number }; onPick?: (lat: number, lng: number) => void; className?: string }) {
  const center: [number, number] = selected ? [selected.lat, selected.lng] : [PASIG_CENTER.lat, PASIG_CENTER.lng];
  return <MapContainer center={center} zoom={14} minZoom={12} maxBounds={PASIG_BOUNDS} maxBoundsViscosity={0.8} scrollWheelZoom className={`${className} w-full rounded-2xl`}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    {onPick && <ClickHandler onPick={onPick}/>} {selected && <Marker position={[selected.lat, selected.lng]} icon={pin}><Popup>Selected report location in Pasig City</Popup></Marker>}
    {complaints.map((item) => <CircleMarker key={item.id} center={[item.latitude, item.longitude]} radius={8 + Math.min(item.me_too_count / 5, 7)} pathOptions={{ color: item.severity === "critical" ? "#e11d48" : categoryColor(item.category_id), fillOpacity: 0.8, weight: 3 }}><Popup><div className="min-w-48"><b>{item.title}</b><p className="my-1 text-xs">{complaintReference(item.id)} · {item.me_too_count} affected</p><Link href={`/complaints/${item.id}`} className="font-bold text-teal-700">View report →</Link></div></Popup></CircleMarker>)}
    {hotspots.map((item) => <Circle key={`h-${item.latitude}-${item.longitude}`} center={[item.latitude, item.longitude]} radius={180 + item.complaints * 7} pathOptions={{ color: item.max_severity >= 0.9 ? "#f43f5e" : "#f59e0b", fillOpacity: 0.12, weight: 2, dashArray: "5 5" }}><Popup><b>Pasig report hotspot</b><p>{item.complaints} reports · {item.supporters} supporters</p></Popup></Circle>)}
  </MapContainer>;
}
