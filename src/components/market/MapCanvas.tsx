'use client';

import { distanceKm } from '@/lib/market/geo';
import type { GeoPoint } from '@/lib/market/types';

/**
 * Built-in schematic map — an Uber-style "pros around you" view that needs no
 * API key: real lat/lng linearly projected onto a stylised canvas. To move to
 * a real map, set NEXT_PUBLIC_GOOGLE_MAPS_KEY or NEXT_PUBLIC_MAPBOX_TOKEN
 * (src/lib/market/config.ts) and swap this component's internals for the
 * provider's JS map; the props contract stays identical, nothing upstream
 * changes. Exact pro locations are deliberately fuzzy pre-booking — pins are
 * area-accurate, not door-accurate.
 */

export interface MapPin {
  id: string;
  location: GeoPoint;
  label?: string;
  kind: 'pro' | 'customer' | 'job';
  online?: boolean;
}

export function MapCanvas({
  center,
  pins,
  spanKm = 14,
  heightClass = 'h-64',
  onPinClick,
}: {
  center: GeoPoint;
  pins: MapPin[];
  spanKm?: number;
  heightClass?: string;
  onPinClick?: (id: string) => void;
}) {
  // km per degree: lat ≈ 111, lng scaled by cos(lat).
  const kmPerLng = 111 * Math.cos((center.lat * Math.PI) / 180);
  const project = (p: GeoPoint) => {
    const x = 50 + ((p.lng - center.lng) * kmPerLng * 100) / spanKm;
    const y = 50 - ((p.lat - center.lat) * 111 * 100) / spanKm;
    return { x: Math.max(4, Math.min(96, x)), y: Math.max(6, Math.min(92, y)) };
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-200 ${heightClass}`}
      style={{
        background:
          'linear-gradient(115deg, rgba(186,230,253,0.35) 0%, transparent 30%),' +
          'linear-gradient(245deg, rgba(167,243,208,0.3) 0%, transparent 35%),' +
          'repeating-linear-gradient(0deg, transparent 0 34px, rgba(100,116,139,0.09) 34px 35px),' +
          'repeating-linear-gradient(90deg, transparent 0 34px, rgba(100,116,139,0.09) 34px 35px),' +
          '#f0f4f8',
      }}
      role="img"
      aria-label="מפת בעלי מקצוע באזור"
    >
      {/* stylised main roads */}
      <div className="absolute inset-x-0 top-1/3 h-2 -rotate-3 bg-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.25)]" />
      <div className="absolute inset-y-0 start-1/4 w-2 rotate-6 bg-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.25)]" />
      <div className="absolute inset-x-0 top-2/3 h-1.5 rotate-2 bg-white/60" />

      {pins.map((pin) => {
        const { x, y } = project(pin.location);
        const km = distanceKm(center, pin.location);
        if (pin.kind === 'customer') {
          return (
            <div
              key={pin.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="absolute -inset-4 animate-ping rounded-full bg-sky-400/30" />
              <span className="relative block h-4 w-4 rounded-full border-2 border-white bg-sky-600 shadow-md" />
            </div>
          );
        }
        return (
          <button
            key={pin.id}
            onClick={() => onPinClick?.(pin.id)}
            className="group absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-label={pin.label}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full rounded-bl-none border-2 border-white text-sm shadow-lg transition group-hover:scale-110 ${
                pin.kind === 'job' ? 'bg-violet-600' : pin.online === false ? 'bg-slate-400' : 'bg-emerald-500'
              }`}
              style={{ transform: 'rotate(-45deg)' }}
            >
              <span style={{ transform: 'rotate(45deg)' }}>{pin.kind === 'job' ? '🧽' : '🚐'}</span>
            </span>
            {pin.label && (
              <span className="pointer-events-none absolute start-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900/90 px-2 py-1 text-[10px] font-bold text-white group-hover:block">
                {pin.label} · {km.toFixed(1)} ק"מ
              </span>
            )}
          </button>
        );
      })}

      <span className="absolute bottom-2 start-2 rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">
        מפה סכמטית · חיבור Google Maps/Mapbox מוכן ב-config
      </span>
    </div>
  );
}
