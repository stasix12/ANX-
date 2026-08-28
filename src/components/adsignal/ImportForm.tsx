'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { importAdAction } from '@/lib/adsignal/actions';
import type { Niche } from '@/lib/adsignal/types';

export function ImportForm({ niches }: { niches: Niche[] }) {
  const [state, formAction, pending] = useActionState(importAdAction, null);

  return (
    <form action={formAction} className="as-card" style={{ display: 'grid', gap: 12 }}>
      <div className="as-field">
        <label htmlFor="i-advertiser">שם המפרסם / העסק *</label>
        <input id="i-advertiser" name="advertiser" required className="as-input" placeholder='למשל: "קליןמאסטר ניקיון"' />
      </div>
      <div className="as-field">
        <label htmlFor="i-body">טקסט המודעה (העתק מ־Ad Library) *</label>
        <textarea id="i-body" name="body" required className="as-input" rows={5}
          placeholder="הדבק כאן את הטקסט המלא של המודעה — המערכת תחלץ ממנו Offers אוטומטית" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="as-field">
          <label htmlFor="i-niche">תחום</label>
          <select id="i-niche" name="niche_key" className="as-select" defaultValue="sofa_cleaning">
            {niches.map((n) => (
              <option key={n.key} value={n.key}>{n.name_he}</option>
            ))}
            <option value="">אחר / לא ידוע</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="i-platform">פלטפורמה</label>
          <select id="i-platform" name="platform" className="as-select" defaultValue="meta">
            <option value="meta">Facebook / Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="google">Google</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="i-country">מדינה</label>
          <select id="i-country" name="country" className="as-select" defaultValue="IL">
            <option value="IL">🇮🇱 ישראל</option>
            <option value="US">🇺🇸 ארה״ב</option>
            <option value="NL">🇳🇱 הולנד</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="i-started">רצה מאז (אם מופיע ב־Ad Library)</label>
          <input id="i-started" name="started_at" type="date" className="as-input" />
        </div>
      </div>
      <div className="as-field">
        <label htmlFor="i-source">קישור למודעה ב־Ad Library (אופציונלי)</label>
        <input id="i-source" name="source_url" className="as-input" dir="ltr" placeholder="https://www.facebook.com/ads/library/?id=…" />
      </div>
      <div className="as-field">
        <label htmlFor="i-landing">דף נחיתה (אופציונלי)</label>
        <input id="i-landing" name="landing_url" className="as-input" dir="ltr" placeholder="https://…" />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
        <input type="checkbox" name="watch" defaultChecked /> הוסף את המפרסם ל־Competitor Watch
      </label>

      <button className="as-btn solid" type="submit" disabled={pending}>
        {pending ? 'מייבא ומחשב ציון…' : '＋ ייבא מודעה'}
      </button>

      {state && !state.ok && <span style={{ color: 'var(--as-red)', fontSize: 13 }}>{state.error}</span>}
      {state?.ok && state.adId && (
        <span style={{ color: 'var(--as-teal)', fontSize: 13.5 }}>
          ✓ יובאה ונוקדה! <Link href={`/adsignal/ads/${state.adId}`} style={{ color: 'var(--as-hot)' }}>פתח את עמוד המודעה ←</Link>
        </span>
      )}
    </form>
  );
}
