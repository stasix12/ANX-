/*
 * The renderer. It draws what it is sent and sends back what somebody did —
 * nothing else. No Node, no file system, no network of its own: every
 * capability it has is one line in preload.cjs.
 *
 * It also never invents a number. Every count on every screen comes from the
 * main process, which read it from the same tables the website reads, through
 * the same policies. A dashboard that shows a plausible figure when it does
 * not know is worse than one that shows a dash, because the owner acts on it.
 */
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svg = (d, w = 17) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICON = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8"/>',
};

/* ------------------------------------------------------------- formatting */

const HHMM = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });
const time = (iso) => (iso ? HHMM.format(new Date(iso)) : '—');
function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return time(iso);
  return `${DAY.format(d)} ${time(iso)}`;
}
function ago(iso) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  return `לפני ${Math.round(h / 24)} ימים`;
}

/* The words a person uses, not the words the database uses. */
const STATUS = {
  published: ['הצליח', 'ok', ICON.check],
  publishing: ['מפרסם עכשיו', 'info', ICON.send],
  scheduled: ['ממתין', 'mute', ICON.clock],
  paused: ['מושהה', 'mute', ICON.clock],
  manual_pending: ['ידני', 'warn', ICON.hand],
  awaiting_confirmation: ['ממתין לאישור', 'warn', ICON.hand],
  needs_attention: ['דורש אתכם', 'warn', ICON.warn],
  failed: ['נכשל', 'err', ICON.x],
  skipped: ['דולג', 'mute', ICON.x],
};
const TINT = { ok: 'tint-ok', warn: 'tint-warn', err: 'tint-err', info: 'tint-info', mute: 'tint-brand' };
const KIND_TINT = { success: 'ok', failure: 'err', round: 'info', schedule: 'info', system: 'mute' };

/* ------------------------------------------------------------------ state */

let state = { running: false, paused: false, signedIn: false, email: '' };
let data = null;
let tab = 'all';
let prefs = {};

/* ------------------------------------------------------------------ login */

$('eye').addEventListener('click', () => {
  const f = $('pw');
  f.type = f.type === 'password' ? 'text' : 'password';
});

function loginError(message, good) {
  const box = $('loginerr');
  box.hidden = !message;
  box.textContent = message || '';
  box.classList.toggle('ok', !!good);
}

function busy(button, on, label) {
  button.disabled = on;
  if (on) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}

$('pwform').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError('');
  busy($('signin'), true, 'מתחבר…');
  const r = await window.anx.signInPassword($('email').value.trim(), $('pw').value);
  busy($('signin'), false);
  if (!r.ok) loginError(r.message);
  else enter();
});

let otpSent = false;
$('otplink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  if (!email) {
    loginError('קודם המייל, ואז נשלח אליו קוד.');
    $('email').focus();
    return;
  }
  loginError('');
  const r = await window.anx.sendCode(email);
  if (!r.ok) return loginError(r.message);
  otpSent = true;
  $('otpform').hidden = false;
  $('otpcode').focus();
  loginError('שלחנו קוד למייל. אם הוא לא מגיע תוך דקה — בדקו בספאם.', true);
});

$('otpform').addEventListener('submit', async (e) => {
  e.preventDefault();
  busy($('otpverify'), true, 'בודק…');
  const r = await window.anx.verifyCode($('email').value.trim(), $('otpcode').value);
  busy($('otpverify'), false);
  if (!r.ok) loginError(r.message);
  else enter();
});

$('google').addEventListener('click', async () => {
  loginError('נפתח חלון בדפדפן. אפשר לחזור לכאן אחרי ההתחברות.', true);
  const r = await window.anx.signInGoogle();
  if (!r.ok) loginError(r.message);
  else enter();
});

$('signup').addEventListener('click', (e) => {
  e.preventDefault();
  /* Signing up happens where a person can read what they are agreeing to and
     see the address bar. Never in here. */
  window.anx.openSite();
});

function enter() {
  $('login').style.display = 'none';
  $('shell').classList.add('on');
  refresh();
}

/* ------------------------------------------------------------ navigation */

const PAGES = ['home', 'tasks', 'activity', 'settings', 'updates', 'help'];
function go(page) {
  if (!PAGES.includes(page)) return;
  for (const p of PAGES) $(`page-${p}`).hidden = p !== page;
  for (const a of document.querySelectorAll('aside a')) a.classList.toggle('on', a.dataset.page === page);
}
for (const a of document.querySelectorAll('aside a')) a.addEventListener('click', () => go(a.dataset.page));
for (const b of document.querySelectorAll('[data-goto]')) b.addEventListener('click', () => go(b.dataset.goto));

$('opensite').addEventListener('click', () => window.anx.openSite());
$('minibtn').addEventListener('click', () => window.anx.mini());
$('power').addEventListener('change', (e) => window.anx.pause(!e.target.checked));
$('signout').addEventListener('click', async () => {
  await window.anx.signOut();
  $('shell').classList.remove('on');
  $('login').style.display = '';
  $('pw').value = '';
});
$('addtask').addEventListener('click', () => window.anx.openSite());

/* Facebook. Every one of these only asks the engine to open a real Chrome
   window on Facebook's own page — nothing here ever takes a Facebook password. */
async function fb(fn, button, label) {
  busy(button, true, label);
  const r = await fn();
  busy(button, false);
  if (!r.ok) alert(r.message);
  else setTimeout(refresh, 1500);
}
$('fbconnect').addEventListener('click', (e) => fb(window.anx.fbConnect, e.currentTarget, 'פותח…'));
$('fbrecheck').addEventListener('click', (e) => fb(window.anx.fbCheck, e.currentTarget, 'בודק…'));
$('fbout').addEventListener('click', (e) => fb(window.anx.fbDisconnect, e.currentTarget, 'מנתק…'));
$('fbverify').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('fbcode').value.trim();
  if (!code) return;
  const r = await window.anx.fbVerify(code);
  $('fbcode').value = '';
  if (!r.ok) alert(r.message);
  else setTimeout(refresh, 1500);
});
$('opendrawer').addEventListener('click', () => $('drawer').classList.add('on'));
$('closedrawer').addEventListener('click', () => $('drawer').classList.remove('on'));

/* ------------------------------------------------------------- rendering */

function paintState(s) {
  state = { ...state, ...s };
  const dot = $('dot');
  dot.className = `dot${state.running ? ' on' : state.paused ? ' paused' : ''}`;
  $('statetext').textContent = !state.signedIn ? 'לא מחובר' : state.paused ? 'מושהה' : state.running ? 'פעיל' : 'נעצר';
  $('power').checked = !state.paused;
  $('whomail').textContent = state.email || '—';
  $('setmail').textContent = state.email || '—';
  const hour = new Date().getHours();
  $('greet').textContent = hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב';
  if (state.signedIn) enter();
}

function feedRow(a) {
  const tint = KIND_TINT[a.kind] ?? 'mute';
  const row = el('div', 'row');
  row.append(el('span', 'time', time(a.at)));
  const ico = el('span', `ico ${TINT[tint]}`);
  ico.innerHTML = svg(tint === 'ok' ? ICON.check : tint === 'err' ? ICON.x : tint === 'info' ? ICON.send : ICON.clock, 16);
  row.append(ico);
  const what = el('div', 'what');
  /*
   * The message and nothing else. `a.event` is the machine's name for what
   * happened — queue_published, worker_login_ok — and printing it under a
   * perfectly good Hebrew sentence is exactly the "this is a script, not a
   * product" signal this redesign exists to remove. It is still carried in
   * the payload, and the technical drawer still has everything.
   */
  what.append(el('b', null, a.message || 'פעולה'));
  what.append(el('span', null, ago(a.at)));
  row.append(what);
  const badge = el('span', `badge ${tint === 'mute' ? 'mute' : tint}`);
  badge.textContent = { ok: 'הצליח', err: 'תקלה', warn: 'ממתין', info: 'מידע', mute: 'מערכת' }[tint] ?? 'מידע';
  row.append(badge);
  return row;
}

function taskRow(t) {
  const [label, tone, icon] = STATUS[t.status] ?? ['—', 'mute', ICON.clock];
  const row = el('div', 'row');
  const ico = el('span', `ico ${TINT[tone]}`);
  ico.innerHTML = svg(icon, 17);
  row.append(ico);
  const mid = el('div');
  /* The group, when the row knows it. "פרסום מתוזמן" five times in a row tells
     nobody anything; the name of the group is the whole content of the line. */
  mid.append(el('b', null, t.target || (t.publishedAt ? 'פרסום לקבוצה' : 'פרסום מתוזמן')));
  mid.append(el('small', null, t.error || t.step || (t.publishedAt ? `פורסם ${when(t.publishedAt)}` : `מתוזמן ל־${when(t.scheduledAt)}`)));
  row.append(mid);
  row.append(el('span', 'dim num', when(t.publishedAt || t.scheduledAt)));
  const badge = el('span', `badge ${tone}`);
  badge.textContent = label;
  row.append(badge);
  return row;
}

function empty(node, title, sub) {
  node.replaceChildren();
  const box = el('div', 'empty');
  box.innerHTML = svg('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>', 40);
  box.append(el('b', null, title));
  box.append(el('span', null, sub));
  node.append(box);
}

const TABS = [
  ['all', 'הכל'],
  ['active', 'פעיל'],
  ['waiting', 'ממתין'],
  ['done', 'הסתיים'],
  ['failed', 'נכשל'],
];

function paintData(d) {
  if (!d || d.error) {
    if (d?.error) $('tasklead').textContent = `לא הצלחנו לקרוא: ${d.error}`;
    return;
  }
  data = d;

  $('s-queue').textContent = d.counts.waiting + d.counts.active;
  $('s-queue-sub').textContent = d.nextAt ? `הבאה ב־${when(d.nextAt)}` : 'אין משימה קרובה';
  $('s-today').textContent = d.doneToday;
  $('s-today-sub').textContent = d.doneToday ? 'פרסומים יצאו היום' : 'עדיין לא יצא פרסום היום';
  $('s-last').textContent = d.lastAt ? time(d.lastAt) : '—';
  $('s-last-sub').textContent = d.lastAt ? ago(d.lastAt) : 'אין עדיין';
  $('s-attn').textContent = d.needsHuman;
  $('s-attn-sub').textContent = d.needsHuman ? 'לא ימשיכו בלי אישור' : 'הכול רץ לבד';
  $('navtasks').textContent = d.counts.waiting + d.counts.active;

  /*
   * IS FACEBOOK CONNECTED? Three states, and the card only exists for two of
   * them: not connected at all, and connected-but-Facebook-wants-a-code.
   * Once an account is on, the card disappears and the face goes in the header.
   */
  const m = d.machine ?? {};
  const connected = !!m.fb_user_id;
  const challenge = m.login_stage === 'challenge';
  $('fbcard').hidden = connected && !challenge;
  $('fbverify').hidden = !challenge;
  if (challenge) {
    $('fbtitle').textContent = 'פייסבוק ביקש קוד אימות';
    $('fbsub').textContent = 'הקוד נשלח אליכם מפייסבוק — בהודעה, במייל או באפליקציה. הקלידו אותו כאן.';
    $('fbconnect').hidden = true;
  } else {
    $('fbtitle').textContent = 'חברו את חשבון הפייסבוק שלכם';
    $('fbsub').textContent = 'ייפתח חלון Chrome על הדף של פייסבוק עצמו. הסיסמה נשארת אצלכם — אנחנו לא רואים אותה ולא שומרים אותה.';
    $('fbconnect').hidden = false;
  }
  $('setfb').textContent = connected ? (m.fb_user_name || 'מחובר') : 'לא מחובר';

  if (d.machine?.fb_user_name) $('whoname').textContent = d.machine.fb_user_name;
  if (d.machine?.fb_avatar_url) {
    const img = el('img');
    img.src = d.machine.fb_avatar_url;
    img.alt = '';
    $('avatar').replaceWith(img);
    img.id = 'avatar';
  }
  if (d.machine?.version) {
    $('ver').textContent = d.machine.version;
    $('ver2').textContent = d.machine.version;
  }

  const home = $('feed-home');
  if (!d.activity.length) empty(home, 'עוד לא קרה כלום', 'ברגע שיצא פרסום הוא יופיע כאן.');
  else home.replaceChildren(...d.activity.slice(0, 6).map(feedRow));

  const all = $('feed-all');
  if (!d.activity.length) empty(all, 'היומן ריק', 'כל פעולה שהמנוע יעשה תירשם כאן.');
  else all.replaceChildren(...d.activity.map(feedRow));

  const next = d.tasks
    .filter((t) => t.tab === 'waiting' || t.tab === 'active')
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))
    .slice(0, 5);
  const nextBox = $('next-home');
  if (!next.length) empty(nextBox, 'אין משימות בתור', 'בונים סבב חדש בדשבורד באתר.');
  else nextBox.replaceChildren(...next.map(taskRow));

  const tabs = $('tabs');
  tabs.replaceChildren(
    ...TABS.map(([key, label]) => {
      const b = el('button', key === tab ? 'on' : '');
      b.append(document.createTextNode(label));
      const i = el('i', null, String(key === 'all' ? d.counts.all : d.counts[key] ?? 0));
      b.append(i);
      b.addEventListener('click', () => { tab = key; paintData(data); });
      return b;
    }),
  );

  const rows = d.tasks.filter((t) => tab === 'all' || t.tab === tab);
  $('tasklead').textContent = `${rows.length} משימות`;
  const list = $('tasklist');
  if (!rows.length) empty(list, 'אין כאן כלום', 'נסו לשונית אחרת, או בנו סבב חדש בדשבורד.');
  else list.replaceChildren(...rows.slice(0, 120).map(taskRow));
}

/* ------------------------------------------------------------- settings */

const SETTINGS = [
  ['openAtLogin', 'הפעל עם Windows', 'התוכנה תעלה לבד אחרי הדלקה של המחשב', ICON.check],
  ['keepRunning', 'המשך לעבוד ברקע', 'סגירת החלון לא עוצרת את הפרסום', ICON.clock],
  ['minimizeToTray', 'מזער לסמל ליד השעון', 'במקום לסגור לגמרי', ICON.clock],
  ['startMinimized', 'הפעלה במצב ממוזער', 'בלי לפתוח חלון בכל הדלקה', ICON.clock],
  ['autoUpdates', 'עדכונים אוטומטיים', 'התקנה של גרסה חדשה בלי לשאול', ICON.check],
  ['notifications', 'התראות', 'הודעה כשמשהו דורש אתכם', ICON.warn],
];

function paintPrefs(p) {
  prefs = { ...prefs, ...p };
  document.documentElement.dataset.theme = prefs.theme || 'dark';
  const box = $('setrows');
  box.replaceChildren(
    ...SETTINGS.map(([key, title, sub, icon]) => {
      const row = el('div', 'setrow');
      const ico = el('span', 'ico tint-brand');
      ico.innerHTML = svg(icon, 16);
      row.append(ico);
      const txt = el('div', 'txt');
      txt.append(el('b', null, title));
      txt.append(el('span', null, sub));
      row.append(txt);
      const sw = el('label', 'switch');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = !!prefs[key];
      input.addEventListener('change', () => window.anx.setPrefs({ [key]: input.checked }));
      sw.append(input, el('span'));
      row.append(sw);
      return row;
    }),
    (() => {
      const row = el('div', 'setrow');
      const ico = el('span', 'ico tint-brand');
      ico.innerHTML = svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>', 16);
      row.append(ico);
      const txt = el('div', 'txt');
      txt.append(el('b', null, 'מצב כהה'));
      txt.append(el('span', null, 'בהיר או כהה — נשמר למחשב הזה'));
      row.append(txt);
      const sw = el('label', 'switch');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = prefs.theme !== 'light';
      input.addEventListener('change', () => window.anx.setPrefs({ theme: input.checked ? 'dark' : 'light' }));
      sw.append(input, el('span'));
      row.append(sw);
      return row;
    })(),
  );
}

/* ---------------------------------------------------------- the drawer */

const log = $('log');
function addLine(entry) {
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const div = el('div', entry.kind, entry.line);
  log.append(div);
  while (log.childElementCount > 600) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
  if (entry.kind === 'prompt') {
    $('ask').textContent = entry.line.trim();
    $('answerbar').classList.add('on');
    $('drawer').classList.add('on');
    $('answer').focus();
  }
}
$('answerform').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('answer').value;
  if (!v.trim()) return;
  window.anx.answer(v);
  $('answer').value = '';
  $('answerbar').classList.remove('on');
});

/* ------------------------------------------------------------------ wire */

window.anx.onState(paintState);
window.anx.onData(paintData);
window.anx.onPrefs(paintPrefs);
window.anx.onNav(go);
window.anx.onLine(addLine);
window.anx.onHistory((lines) => { log.replaceChildren(); lines.forEach(addLine); });

async function refresh() {
  paintData(await window.anx.data());
}

(async () => {
  const s = await window.anx.state();
  paintPrefs(s.prefs);
  paintState(s);
  if (s.signedIn) refresh();
})();
