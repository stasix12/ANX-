'use client';

import Link from 'next/link';
import { HqShell } from '@/components/platform/HqShell';
import { Badge } from '@/components/platform/ui';
import { cityStats } from '@/lib/platform/analytics';
import { cityName } from '@/lib/platform/catalog';
import { usePlatform } from '@/lib/platform/store';

/**
 * National demand/supply view per city. A graphical Google Maps/Mapbox layer
 * plugs in via the maps adapter once a key exists (docs/PLATFORM.md); the
 * business question — where is demand without supply — is answered here.
 */

function CityMap() {
  const snap = usePlatform();
  if (!snap) return null;

  const rows = cityStats(snap);
  const gaps = rows.filter((r) => r.gap);

  return (
    <div className="crm-page">
      <h1 className="text-2xl font-black text-mist-100">מפה ארצית — ביקוש מול היצע</h1>

      {gaps.length > 0 && (
        <div className="mt-3 rounded-card bg-red-500/10 p-4">
          <div className="font-black text-red-700">⚠️ אזורים עם ביקוש ובלי מספיק מנקים — כאן מגייסים:</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {gaps.map((g) => (
              <span key={g.cityId} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-red-700 shadow-sm">
                {cityName(g.cityId)} · {g.openJobs + g.openLeads} ביקושים · {g.onlinePros} Online
              </span>
            ))}
          </div>
          <Link href="/pro/join" className="mt-2 inline-block text-sm font-black text-red-700 underline">
            לדף הגיוס ←
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.cityId} className={`surface rounded-card p-4 ${r.gap ? 'ring-2 ring-red-400' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-black text-mist-100">
                {r.gap ? '🔥' : '📍'} {cityName(r.cityId)}
              </span>
              {r.gap ? (
                <Badge className="bg-red-500/15 text-red-600">חוסר מנקים</Badge>
              ) : r.onlinePros > 0 ? (
                <Badge className="bg-emerald-500/15 text-emerald-700">מכוסה</Badge>
              ) : (
                <Badge className="bg-ink-800 text-mist-500">שקט</Badge>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-xl bg-ink-900 p-2">
                <div className="text-xs text-mist-500">עבודות פתוחות</div>
                <div className="text-xl font-black text-brand-400">{r.openJobs}</div>
              </div>
              <div className="rounded-xl bg-ink-900 p-2">
                <div className="text-xs text-mist-500">מנקים Online</div>
                <div className={`text-xl font-black ${r.onlinePros === 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {r.onlinePros}
                </div>
              </div>
              <div className="rounded-xl bg-ink-900 p-2">
                <div className="text-xs text-mist-500">לידים פתוחים</div>
                <div className="text-xl font-black text-mist-100">{r.openLeads}</div>
              </div>
              <div className="rounded-xl bg-ink-900 p-2">
                <div className="text-xs text-mist-500">עבודות היום</div>
                <div className="text-xl font-black text-mist-100">{r.todayJobs}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-mist-500">
        מפה גרפית (Google Maps / Mapbox) מתחברת דרך ה-maps adapter — ראו docs/PLATFORM.md, ״איפה מכניסים מפתחות״.
      </p>
    </div>
  );
}

export default function MapPage() {
  return (
    <HqShell>
      <CityMap />
    </HqShell>
  );
}
