/* The small panel. Same data, four numbers of it. */
const $ = (id) => document.getElementById(id);
let paused = false;

window.anx.onState((s) => {
  paused = !!s.paused;
  $('dot').className = `dot${s.running ? ' on' : s.paused ? ' paused' : ''}`;
  $('statetext').textContent = !s.signedIn ? 'לא מחובר' : s.paused ? 'מושהה' : s.running ? 'פעיל' : 'נעצר';
  $('pause').textContent = s.paused ? 'המשך' : 'השהה';
});
window.anx.onData((d) => {
  if (!d || d.error) return;
  $('queue').textContent = d.counts.waiting + d.counts.active;
  $('today').textContent = d.doneToday;
});
window.anx.onPrefs((p) => { document.documentElement.dataset.theme = p.theme || 'dark'; });

$('open').addEventListener('click', () => window.anx.openMain());
$('close').addEventListener('click', () => window.anx.mini());
$('pause').addEventListener('click', () => window.anx.pause(!paused));

(async () => {
  const s = await window.anx.state();
  document.documentElement.dataset.theme = s.prefs?.theme || 'dark';
  window.dispatchEvent(new Event('ready'));
  const d = await window.anx.data();
  if (d && !d.error) {
    $('queue').textContent = d.counts.waiting + d.counts.active;
    $('today').textContent = d.doneToday;
  }
})();
