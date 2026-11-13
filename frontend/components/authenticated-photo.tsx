"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, tokenStore } from "@/lib/api";
import type { Photo } from "@/lib/types";

/** Loads a MySQL-backed photo through the JWT-protected API, then renders a local object URL. */
export function AuthenticatedPhoto({
  photo,
  alt,
  className,
}: {
  photo: Pick<Photo, "id">;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    async function load() {
      const token = tokenStore.get();
      if (!token) {
        setError(true);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/photos/${encodeURIComponent(photo.id)}/content`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Photo request failed (${response.status})`);
        objectUrl = URL.createObjectURL(await response.blob());
        setSrc(objectUrl);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(true);
      }
    }

    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  if (error) {
    return <div className={`${className ?? ""} grid place-items-center bg-slate-100 text-xs text-slate-400`}>Photo unavailable</div>;
  }
  if (!src) {
    return <div className={`${className ?? ""} animate-pulse bg-slate-100`} aria-label="Loading photo" />;
  }
  return <img src={src} alt={alt} className={className} />;
}
