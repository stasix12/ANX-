/**
 * הפתרון המבריק – the site's own visit counter and the owner's /admin panel.
 *
 * Published as `_worker.js` next to the static pages (Cloudflare Pages
 * "advanced mode"); `_routes.json` sends only /api/* and /admin* here, every
 * other URL is served as a plain static file, exactly as before.
 *
 * Bindings (Pages → Settings):
 *   DB              a D1 database – the `hits` table is created on first use
 *   ADMIN_PASSWORD  secret – the /admin login
 *   ASSETS          provided by Pages
 *
 *   POST /api/hit            one row per page view / heartbeat / event
 *   GET  /admin              login, or the dashboard
 *   POST /admin/login|logout
 *   GET  /admin/api/stats?from=&to=   aggregates for a period (epoch ms)
 *   GET  /admin/api/live              who is on the site right now
 */

const LIVE_WINDOW_MS = 5 * 60 * 1000;
const COOKIE = 'hv_admin';
const BOT_UA = /bot|crawl|spider|slurp|lighthouse|headless|pagespeed|gtmetrix|preview|monitor|curl|wget|python|scrapy|facebookexternalhit|whatsapp|telegram|discord|skype|embedly/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/hit') return hit(request, env);
    if (path === '/admin' || path.startsWith('/admin/')) return admin(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

/* ── storage ──────────────────────────────────────────────────────────── */

let schemaReady = false;

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT,
      sid TEXT NOT NULL,
      vid TEXT,
      path TEXT,
      src TEXT,
      ref TEXT,
      city TEXT,
      country TEXT,
      device TEXT,
      meta TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS hits_ts ON hits(ts)'),
    db.prepare('CREATE INDEX IF NOT EXISTS hits_sid_ts ON hits(sid, ts)'),
  ]);
  schemaReady = true;
}

/* ── /api/hit ─────────────────────────────────────────────────────────── */

async function hit(request, env) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (!env.DB) return new Response(null, { status: 204 });

  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const type = body.t === 'view' || body.t === 'ping' || body.t === 'event' ? body.t : null;
  const sid = id(body.s);
  if (!type || !sid) return new Response(null, { status: 400 });

  const cf = request.cf || {};
  const row = {
    ts: Date.now(),
    type,
    name: type === 'event' ? str(body.n, 40) : null,
    sid,
    vid: id(body.v),
    path: str(body.p, 200) || '/',
    src: source(str(body.r, 500), str(body.q, 500)),
    ref: refHost(str(body.r, 500)),
    city: str(cf.city, 60),
    country: str(cf.country, 2),
    device: device(ua, Number(body.w) || 0),
    meta: type === 'event' && body.m && typeof body.m === 'object' ? JSON.stringify(body.m).slice(0, 500) : null,
  };

  try {
    await ensureSchema(env.DB);
    await env.DB.prepare(
      'INSERT INTO hits (ts,type,name,sid,vid,path,src,ref,city,country,device,meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(row.ts, row.type, row.name, row.sid, row.vid, row.path, row.src, row.ref, row.city, row.country, row.device, row.meta)
      .run();
  } catch (e) {
    console.warn('[hit] insert failed', e && e.message);
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

function id(v) {
  return typeof v === 'string' && /^[a-f0-9]{8,32}$/.test(v) ? v : null;
}
function str(v, max) {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
}
function refHost(ref) {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
function device(ua, width) {
  if (/ipad|tablet/i.test(ua) || (width >= 768 && width < 1100 && /mobile|android/i.test(ua))) return 'tablet';
  if (/mobile|android|iphone/i.test(ua) || (width && width < 768)) return 'mobile';
  return 'desktop';
}

/** Where the visit came from, in the words the owner uses. */
function source(ref, query) {
  const q = new URLSearchParams(query || '');
  if (q.get('gclid') || q.get('gad_source') || q.get('gbraid') || q.get('wbraid')) return 'google-ads';
  const utm = (q.get('utm_source') || '').toLowerCase();
  const medium = (q.get('utm_medium') || '').toLowerCase();
  if (utm) {
    if (/google/.test(utm) && /cpc|ppc|paid/.test(medium)) return 'google-ads';
    if (/facebook|fb|instagram|ig/.test(utm)) return 'facebook';
    if (/whatsapp|wa/.test(utm)) return 'whatsapp';
    if (/google/.test(utm)) return 'google';
    return utm.slice(0, 30);
  }
  if (q.get('fbclid')) return 'facebook';
  const host = refHost(ref) || '';
  if (!host) return 'direct';
  if (/google\./.test(host)) return 'google';
  if (/facebook|instagram|fb\.com|fb\.me|l\.facebook/.test(host)) return 'facebook';
  if (/whatsapp|wa\.me/.test(host)) return 'whatsapp';
  if (/bing\.|yahoo\.|duckduckgo|yandex/.test(host)) return 'search-other';
  if (/pitaron-hamavrik/.test(host)) return 'direct';
  return host.slice(0, 30);
}

/* ── /admin ───────────────────────────────────────────────────────────── */

async function admin(request, env, url) {
  const path = url.pathname;
  const secret = env.ADMIN_PASSWORD || '';

  if (!secret || !env.DB) return html(setupPage(Boolean(secret), Boolean(env.DB)), 200);

  if (path === '/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    const given = String(form.get('password') || '');
    if (given.length === 0 || !(await equal(given, secret))) {
      await sleep(600);
      return html(loginPage(true), 401);
    }
    const token = await hmac(secret, 'session-v1');
    return new Response(null, {
      status: 303,
      headers: {
        location: '/admin',
        'set-cookie': `${COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
      },
    });
  }

  if (path === '/admin/logout') {
    return new Response(null, {
      status: 303,
      headers: { location: '/admin', 'set-cookie': `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
    });
  }

  const authed = await isAuthed(request, secret);
  if (!authed) {
    if (path.startsWith('/admin/api/')) return json({ error: 'unauthorized' }, 401);
    return html(loginPage(false), 200);
  }

  if (path === '/admin/api/stats') return stats(env.DB, url);
  if (path === '/admin/api/live') return live(env.DB);
  if (path === '/admin') return html(dashboardPage(), 200);
  return new Response('Not found', { status: 404 });
}

async function isAuthed(request, secret) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`));
  if (!m) return false;
  return equal(m[1], await hmac(secret, 'session-v1'));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison via digests of equal length. */
async function equal(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── queries ──────────────────────────────────────────────────────────── */

async function stats(db, url) {
  await ensureSchema(db);
  const now = Date.now();
  const to = clampNum(url.searchParams.get('to'), now);
  const from = clampNum(url.searchParams.get('from'), to - 7 * 864e5);
  if (to - from > 400 * 864e5) return json({ error: 'range too long' }, 400);

  const HOUR = 3600000;
  const [totals, hours, sources, pages, cities, devices, events, leads] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(DISTINCT sid) AS visits, COUNT(DISTINCT vid) AS people,
                SUM(type='view') AS views
         FROM hits WHERE ts>=? AND ts<?`,
      )
      .bind(from, to)
      .first(),
    db
      .prepare(
        `SELECT (ts/${HOUR}) AS h, COUNT(DISTINCT sid) AS visits, SUM(type='view') AS views
         FROM hits WHERE ts>=? AND ts<? GROUP BY h ORDER BY h`,
      )
      .bind(from, to)
      .all(),
    db
      .prepare(`SELECT src AS k, COUNT(DISTINCT sid) AS n FROM hits WHERE ts>=? AND ts<? GROUP BY src ORDER BY n DESC LIMIT 12`)
      .bind(from, to)
      .all(),
    db
      .prepare(
        `SELECT path AS k, SUM(type='view') AS views, COUNT(DISTINCT sid) AS n FROM hits
         WHERE ts>=? AND ts<? AND type='view' GROUP BY path ORDER BY views DESC LIMIT 15`,
      )
      .bind(from, to)
      .all(),
    db
      .prepare(
        `SELECT COALESCE(city,'?') AS k, COUNT(DISTINCT sid) AS n FROM hits WHERE ts>=? AND ts<? GROUP BY city ORDER BY n DESC LIMIT 15`,
      )
      .bind(from, to)
      .all(),
    db
      .prepare(`SELECT COALESCE(device,'?') AS k, COUNT(DISTINCT sid) AS n FROM hits WHERE ts>=? AND ts<? GROUP BY device ORDER BY n DESC`)
      .bind(from, to)
      .all(),
    db
      .prepare(`SELECT name AS k, COUNT(*) AS n, COUNT(DISTINCT sid) AS visits FROM hits WHERE ts>=? AND ts<? AND type='event' GROUP BY name ORDER BY n DESC`)
      .bind(from, to)
      .all(),
    db
      .prepare(
        `SELECT ts, name, path, city, src, device, meta FROM hits
         WHERE ts>=? AND ts<? AND type='event' AND name IN ('whatsapp_click','phone_click','quote_completed')
         ORDER BY ts DESC LIMIT 30`,
      )
      .bind(from, to)
      .all(),
  ]);

  return json({
    from,
    to,
    totals: { visits: totals?.visits || 0, people: totals?.people || 0, views: totals?.views || 0 },
    hours: hours.results.map((r) => ({ t: r.h * HOUR, visits: r.visits, views: r.views })),
    sources: sources.results,
    pages: pages.results,
    cities: cities.results,
    devices: devices.results,
    events: events.results,
    leads: leads.results.map((r) => ({ ...r, meta: safeJson(r.meta) })),
  });
}

async function live(db) {
  await ensureSchema(db);
  const since = Date.now() - LIVE_WINDOW_MS;
  const rows = await db
    .prepare(
      `SELECT h.sid, h.ts, h.path, h.city, h.device, h.src,
              (SELECT MIN(ts) FROM hits s WHERE s.sid=h.sid) AS started,
              (SELECT COUNT(*) FROM hits s WHERE s.sid=h.sid AND s.type='view') AS pages
       FROM hits h
       JOIN (SELECT sid, MAX(ts) AS m FROM hits WHERE ts>=? GROUP BY sid) x ON x.sid=h.sid AND x.m=h.ts
       ORDER BY h.ts DESC LIMIT 50`,
    )
    .bind(since)
    .all();
  return json({ now: Date.now(), window: LIVE_WINDOW_MS, visitors: rows.results });
}

function clampNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function safeJson(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/* ── responses ────────────────────────────────────────────────────────── */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
function html(body, status) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    },
  });
}

/* ── pages ────────────────────────────────────────────────────────────── */

const HEAD = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>אדמין – הפתרון המבריק</title>
<link rel="icon" href="/hamavrik/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;800;900&display=swap" rel="stylesheet">
<style>
:root{--bg:#f5f8fc;--card:#fff;--ink:#0f172a;--mist:#475569;--line:#e2e8f0;--brand:#1a56db;--brand-50:#eaf0fd;--wa:#25d366;--amber:#f59e0b;--red:#dc2626}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:Heebo,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--brand)}button{font:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:16px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 16px}
.top h1{font-size:20px;margin:0;font-weight:900}.top .sub{color:var(--mist);font-size:13px}
.logo{height:36px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 12px}@media(min-width:720px){.kpis{grid-template-columns:repeat(4,1fr)}}@media(min-width:1000px){.kpis{grid-template-columns:repeat(7,1fr)}}
.kpi{padding:14px 14px 12px}.kpi .l{font-size:12px;color:var(--mist);font-weight:600}.kpi .v{font-size:30px;font-weight:900;line-height:1.1;margin-top:4px}.kpi .s{font-size:12px;color:var(--mist);margin-top:2px}
.kpi.live .v{color:#0f8f84}.kpi.live .v::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-inline-end:8px;vertical-align:middle;box-shadow:0 0 0 0 rgba(16,185,129,.6);animation:pulse 1.6s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.6)}100%{box-shadow:0 0 0 10px rgba(16,185,129,0)}}
.kpi.wa .v{color:#15803d}
.periods{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 12px}
.periods button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer;color:var(--ink)}
.periods button.on{background:var(--brand);border-color:var(--brand);color:#fff}
.periods input{border:1px solid var(--line);border-radius:10px;padding:6px 8px;font:inherit}
.grid{display:grid;gap:12px;grid-template-columns:1fr}@media(min-width:900px){.grid{grid-template-columns:1fr 1fr}}
.card h2{font-size:15px;margin:0 0 10px;font-weight:800}
.chart{position:relative;height:220px}
.chart svg{width:100%;height:100%;display:block}
.bar{fill:var(--brand);opacity:.85}.bar:hover{opacity:1}.bar2{fill:#93c5fd}
.axis{font-size:11px;fill:var(--mist)}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:start;color:var(--mist);font-weight:600;font-size:12px;padding:4px 6px;border-bottom:1px solid var(--line)}td{padding:7px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
td.n{text-align:end;font-weight:800;white-space:nowrap}tr:last-child td{border-bottom:0}
.barline{height:6px;border-radius:3px;background:var(--brand-50);overflow:hidden;margin-top:4px}.barline i{display:block;height:100%;background:var(--brand)}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:var(--brand-50);color:var(--brand)}
.tag.wa{background:#dcfce7;color:#15803d}.tag.phone{background:#fef3c7;color:#b45309}.tag.quote{background:#ede9fe;color:#6d28d9}
.muted{color:var(--mist);font-size:13px}.empty{color:var(--mist);padding:18px 0;text-align:center}
.live-list li{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px}.live-list li:last-child{border:0}
.live-list{list-style:none;margin:0;padding:0}.dot{width:8px;height:8px;border-radius:50%;background:#10b981;flex:none}
.foot{display:flex;justify-content:space-between;align-items:center;color:var(--mist);font-size:12px;padding:16px 0 4px;gap:8px;flex-wrap:wrap}
.login{max-width:380px;margin:12vh auto;text-align:center}.login input{width:100%;font-size:18px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;margin:14px 0}
.login button{width:100%;background:var(--brand);color:#fff;border:0;border-radius:12px;padding:13px;font-weight:800;font-size:16px;cursor:pointer}
.err{color:var(--red);font-weight:700}
.setup ol{line-height:1.7}.setup code{background:#eef2ff;padding:1px 6px;border-radius:6px;direction:ltr;display:inline-block}
</style></head><body>`;

function loginPage(failed) {
  return `${HEAD}<div class="wrap"><div class="card login">
<img class="logo" src="/hamavrik/brand/logo.png" alt="" onerror="this.remove()" style="height:44px">
<h1 style="font-size:20px;margin:12px 0 0">כניסה לאדמין</h1>
<p class="muted" style="margin:6px 0 0">סטטיסטיקות הביקורים באתר</p>
<form method="post" action="/admin/login">
<input type="password" name="password" placeholder="סיסמה" autocomplete="current-password" autofocus required>
${failed ? '<p class="err">סיסמה שגויה</p>' : ''}
<button type="submit">כניסה</button></form></div></div></body></html>`;
}

function setupPage(hasSecret, hasDb) {
  return `${HEAD}<div class="wrap"><div class="card setup" style="max-width:640px;margin:8vh auto">
<h1 style="font-size:20px;margin:0 0 8px">האדמין עוד לא מחובר</h1>
<p class="muted">הקוד באוויר, חסרות ההגדרות ב-Cloudflare (Workers &amp; Pages → pitaron-hamavrik → Settings):</p>
<ol>
<li>${hasDb ? '✅' : '❌'} <b>Bindings → D1 database</b>: Variable name <code>DB</code> → מסד הנתונים <code>pitaron-analytics</code> (נוצר ב-Storage &amp; Databases → D1)</li>
<li>${hasSecret ? '✅' : '❌'} <b>Variables and Secrets</b>: Secret בשם <code>ADMIN_PASSWORD</code> עם הסיסמה שלך</li>
<li>Deployments → <b>Retry deployment</b> על הפריסה האחרונה, ואז לרענן את הדף הזה</li>
</ol></div></div></body></html>`;
}

function dashboardPage() {
  return `${HEAD}<div class="wrap">
<div class="top"><div><h1>הפתרון המבריק – ביקורים באתר</h1><div class="sub" id="sub">טוען…</div></div>
<div style="display:flex;gap:8px;align-items:center"><a href="/" class="muted" target="_blank" rel="noopener">לאתר ↗</a><form method="post" action="/admin/logout" style="margin:0"><button class="muted" style="background:none;border:1px solid var(--line);border-radius:999px;padding:6px 12px;cursor:pointer">יציאה</button></form></div></div>

<div class="kpis">
<div class="card kpi live"><div class="l">באתר עכשיו</div><div class="v" id="k-live">–</div><div class="s">ב-5 הדקות האחרונות</div></div>
<div class="card kpi"><div class="l">ביקורים</div><div class="v" id="k-visits">–</div><div class="s" id="k-visits-s">בתקופה</div></div>
<div class="card kpi"><div class="l">מבקרים ייחודיים</div><div class="v" id="k-people">–</div><div class="s">דפדפנים שונים</div></div>
<div class="card kpi"><div class="l">צפיות בדפים</div><div class="v" id="k-views">–</div><div class="s" id="k-views-s">–</div></div>
<div class="card kpi wa"><div class="l">לחיצות WhatsApp</div><div class="v" id="k-wa">–</div><div class="s" id="k-wa-s">–</div></div>
<div class="card kpi"><div class="l">לחיצות טלפון</div><div class="v" id="k-phone">–</div><div class="s">חיוג מהאתר</div></div>
<div class="card kpi"><div class="l">הצעות מחיר</div><div class="v" id="k-quote">–</div><div class="s">טופס / מזגנים</div></div>
</div>

<div class="periods" id="periods">
<button data-p="today">היום</button><button data-p="yesterday">אתמול</button><button data-p="7" class="on">7 ימים</button><button data-p="30">30 ימים</button><button data-p="90">90 ימים</button>
<span class="muted" style="margin-inline-start:8px">מותאם:</span><input type="date" id="from"><span class="muted">עד</span><input type="date" id="to"><button data-p="custom">הצג</button>
</div>

<div class="grid">
<div class="card" style="grid-column:1/-1"><h2 id="chart-title">ביקורים לפי יום</h2><div class="chart" id="chart"></div></div>
<div class="card"><h2>באתר עכשיו</h2><ul class="live-list" id="live"><li class="empty">אין אף אחד כרגע</li></ul></div>
<div class="card"><h2>פניות אחרונות</h2><div id="leads"><div class="empty">אין עדיין</div></div></div>
<div class="card"><h2>מאיפה הגיעו</h2><div id="sources"></div></div>
<div class="card"><h2>ערים</h2><div id="cities"></div></div>
<div class="card"><h2>דפים</h2><div id="pages"></div></div>
<div class="card"><h2>מכשירים</h2><div id="devices"></div><h2 style="margin-top:18px">פעולות</h2><div id="events"></div></div>
</div>
<div class="foot"><span>מתעדכן לבד: "באתר עכשיו" כל 15 שניות, השאר כל דקה. השעות לפי השעון של המכשיר שלך.</span><span id="updated"></span></div>
</div>
<script>
(function(){
const $=s=>document.querySelector(s);
const fmt=n=>new Intl.NumberFormat('he-IL').format(n||0);
const SRC={'google-ads':'גוגל אדס (ממומן)',google:'גוגל (אורגני)',facebook:'פייסבוק / אינסטגרם',whatsapp:'וואטסאפ',direct:'ישיר / קישור',"search-other":'מנוע חיפוש אחר'};
const DEV={mobile:'טלפון',desktop:'מחשב',tablet:'טאבלט','?':'לא ידוע'};
const EV={whatsapp_click:'לחיצה על WhatsApp',phone_click:'לחיצה על טלפון',quote_completed:'הצעת מחיר נשלחה',quote_started:'התחילו טופס',service_selected:'בחרו שירות',before_after_interaction:'הזיזו לפני/אחרי'};
const PAGE={'/':'דף הבית','/beer-sheva':'ניקוי ספות באר שבע','/arad':'ניקוי ספות ערד','/mattress-cleaning-beer-sheva':'ניקוי מזרנים','/car-upholstery-beer-sheva':'ריפודי רכב','/carpet-cleaning-beer-sheva':'ניקוי שטיחים','/gallery':'לפני ואחרי'};
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()};
let period='7', range=null, statsTimer, liveTimer;

function computeRange(){
  const now=Date.now();
  if(period==='today') return [dayStart(now), now, 'hour'];
  if(period==='yesterday'){const t=dayStart(now);return [t-864e5, t, 'hour']}
  if(period==='custom'){
    const f=$('#from').valueAsDate, t=$('#to').valueAsDate;
    if(!f||!t) return null;
    const from=dayStart(f), to=Math.min(dayStart(t)+864e5, now);
    return [from, to, to-from<=2*864e5?'hour':'day'];
  }
  const days=Number(period); return [dayStart(now)-(days-1)*864e5, now, 'day'];
}
function label(ts,g){const d=new Date(ts);return g==='hour'?d.getHours().toString().padStart(2,'0')+':00':d.getDate()+'/'+(d.getMonth()+1)}

function chart(hours,from,to,g){
  const buckets=new Map();
  if(g==='hour'){ for(let t=Math.floor(from/3600000)*3600000; t<to; t+=3600000) buckets.set(t,{visits:0,views:0}); }
  else { for(let d=new Date(dayStart(from)); d.getTime()<to; d.setDate(d.getDate()+1)) buckets.set(d.getTime(),{visits:0,views:0}); }
  for(const h of hours){ const key=g==='hour'?h.t:dayStart(h.t); const b=buckets.get(key); if(b){b.visits+=h.visits;b.views+=h.views} }
  const keys=[...buckets.keys()]; const max=Math.max(1,...keys.map(k=>buckets.get(k).views));
  const W=1000,H=220,pad=24,bw=Math.max(2,(W-pad*2)/keys.length-3);
  let s='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
  keys.forEach((k,i)=>{const b=buckets.get(k);const x=pad+i*((W-pad*2)/keys.length);
    const hv=(b.views/max)*(H-40), hs=(b.visits/max)*(H-40);
    s+='<rect class="bar2" x="'+x+'" y="'+(H-20-hv)+'" width="'+bw+'" height="'+hv+'"><title>'+label(k,g)+': '+b.views+' צפיות, '+b.visits+' ביקורים</title></rect>';
    s+='<rect class="bar" x="'+x+'" y="'+(H-20-hs)+'" width="'+bw+'" height="'+hs+'"><title>'+label(k,g)+': '+b.visits+' ביקורים</title></rect>';
    if(keys.length<=31||i%Math.ceil(keys.length/16)===0) s+='<text class="axis" x="'+(x+bw/2)+'" y="'+(H-4)+'" text-anchor="middle">'+label(k,g)+'</text>';
  });
  s+='</svg>';
  $('#chart').innerHTML=s;
  $('#chart-title').textContent=(g==='hour'?'ביקורים לפי שעה':'ביקורים לפי יום')+' (כהה = ביקורים, בהיר = צפיות)';
}

function table(el,rows,name,total,labelFn){
  if(!rows||!rows.length){el.innerHTML='<div class="empty">אין נתונים</div>';return}
  const max=Math.max(1,...rows.map(r=>r.n));
  el.innerHTML='<table>'+rows.map(r=>'<tr><td>'+(labelFn?labelFn(r.k):esc(r.k))+'<div class="barline"><i style="width:'+(100*r.n/max)+'%"></i></div></td><td class="n">'+fmt(r.n)+(total?' <span class="muted">('+Math.round(100*r.n/total)+'%)</span>':'')+'</td></tr>').join('')+'</table>';
}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when=ts=>{const d=new Date(ts);return d.toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})+' '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})};
const ago=ms=>{const s=Math.round(ms/1000);if(s<60)return 'לפני '+s+' שנ׳';const m=Math.round(s/60);if(m<60)return 'לפני '+m+' דק׳';return 'לפני '+Math.round(m/60)+' שע׳'};

async function loadStats(){
  const r=computeRange(); if(!r) return; range=r;
  const [from,to,g]=r;
  const res=await fetch('/admin/api/stats?from='+from+'&to='+to,{credentials:'same-origin'});
  if(res.status===401){location.reload();return}
  const d=await res.json();
  $('#k-visits').textContent=fmt(d.totals.visits);
  $('#k-people').textContent=fmt(d.totals.people);
  $('#k-views').textContent=fmt(d.totals.views);
  $('#k-views-s').textContent=d.totals.visits?(d.totals.views/d.totals.visits).toFixed(1)+' דפים לביקור':'–';
  const ev=Object.fromEntries((d.events||[]).map(e=>[e.k,e]));
  const wa=(ev.whatsapp_click&&ev.whatsapp_click.n)||0, ph=(ev.phone_click&&ev.phone_click.n)||0, q=(ev.quote_completed&&ev.quote_completed.n)||0;
  $('#k-wa').textContent=fmt(wa); $('#k-wa-s').textContent=d.totals.visits?Math.round(100*(wa+q)/d.totals.visits)+'% מהביקורים פנו':'–';
  $('#k-phone').textContent=fmt(ph); $('#k-quote').textContent=fmt(q);
  const days=Math.max(1,Math.round((to-from)/864e5));
  $('#k-visits-s').textContent=period==='today'?'מאז חצות':period==='yesterday'?'אתמול':Math.round(d.totals.visits/days)+' בממוצע ליום';
  chart(d.hours,from,to,g);
  table($('#sources'),d.sources,'src',d.totals.visits,k=>esc(SRC[k]||k));
  table($('#cities'),d.cities,'city',d.totals.visits,k=>esc(k==='?'?'לא ידוע':k));
  table($('#pages'),d.pages.map(p=>({k:p.k,n:p.views})),'path',d.totals.views,k=>esc(PAGE[k]||k));
  table($('#devices'),d.devices,'device',d.totals.visits,k=>esc(DEV[k]||k));
  table($('#events'),d.events,'event',0,k=>esc(EV[k]||k));
  const L=$('#leads');
  if(!d.leads.length) L.innerHTML='<div class="empty">אין פניות בתקופה</div>';
  else L.innerHTML='<table><tr><th>מתי</th><th>מה</th><th>מאיפה</th></tr>'+d.leads.map(l=>{
    const cls=l.name==='whatsapp_click'?'wa':l.name==='phone_click'?'phone':'quote';
    const what=EV[l.name]||l.name; const loc=l.meta&&(l.meta.location||l.meta.service)?' <span class="muted">('+esc(l.meta.location||l.meta.service)+')</span>':'';
    return '<tr><td class="muted" style="white-space:nowrap">'+when(l.ts)+'</td><td><span class="tag '+cls+'">'+what+'</span>'+loc+'<div class="muted">'+esc(PAGE[l.path]||l.path)+'</div></td><td class="muted">'+esc(SRC[l.src]||l.src||'')+'<br>'+esc(l.city||'')+' · '+esc(DEV[l.device]||'')+'</td></tr>'}).join('')+'</table>';
  $('#sub').textContent=new Date(from).toLocaleDateString('he-IL')+' – '+new Date(to).toLocaleDateString('he-IL');
  $('#updated').textContent='עודכן '+new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
async function loadLive(){
  const res=await fetch('/admin/api/live',{credentials:'same-origin'}); if(res.status===401){location.reload();return}
  const d=await res.json();
  $('#k-live').textContent=fmt(d.visitors.length);
  const ul=$('#live');
  if(!d.visitors.length){ul.innerHTML='<li class="empty" style="display:block">אין אף אחד כרגע</li>';return}
  ul.innerHTML=d.visitors.map(v=>'<li><span class="dot"></span><div style="flex:1"><b>'+esc(PAGE[v.path]||v.path)+'</b> <span class="muted">· '+esc(v.city||'עיר לא ידועה')+' · '+esc(DEV[v.device]||'')+' · '+esc(SRC[v.src]||v.src||'')+'</span><div class="muted">'+v.pages+' דפים · באתר '+ago(d.now-v.started).replace('לפני ','')+' · פעיל '+ago(d.now-v.ts)+'</div></div></li>').join('');
}
$('#periods').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;period=b.dataset.p;[...$('#periods').querySelectorAll('button')].forEach(x=>x.classList.toggle('on',x===b));loadStats()});
function start(){loadStats();loadLive();clearInterval(statsTimer);clearInterval(liveTimer);statsTimer=setInterval(loadStats,60000);liveTimer=setInterval(loadLive,15000)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')start()});
start();
})();
</script></body></html>`;
}
