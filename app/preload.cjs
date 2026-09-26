/*
 * The whole surface the window is given.
 *
 * The renderer has no Node, no file system and no network of its own: it is a
 * local page whose only job is to draw what it is sent and send back what
 * somebody did. Every capability it has is one line here, which is what keeps
 * that claim checkable.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anx', {
  /* pushed from the main process */
  onLine: (fn) => ipcRenderer.on('worker:line', (_e, entry) => fn(entry)),
  onHistory: (fn) => ipcRenderer.on('worker:history', (_e, lines) => fn(lines)),
  onState: (fn) => ipcRenderer.on('worker:state', (_e, state) => fn(state)),
  onData: (fn) => ipcRenderer.on('data', (_e, data) => fn(data)),
  onPrefs: (fn) => ipcRenderer.on('prefs', (_e, prefs) => fn(prefs)),
  onNav: (fn) => ipcRenderer.on('nav', (_e, page) => fn(page)),

  /* asked for, and answered */
  state: () => ipcRenderer.invoke('app:state'),
  data: () => ipcRenderer.invoke('app:data'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  signInPassword: (email, password) => ipcRenderer.invoke('auth:password', { email, password }),
  sendCode: (email) => ipcRenderer.invoke('auth:otp-send', { email }),
  verifyCode: (email, token) => ipcRenderer.invoke('auth:otp-verify', { email, token }),
  signInGoogle: () => ipcRenderer.invoke('auth:google'),
  signOut: () => ipcRenderer.invoke('auth:signout'),

  /* Facebook. The typing happens on Facebook's own page in a real Chrome
     window; these only ask the engine to open it. */
  fbConnect: () => ipcRenderer.invoke('fb:connect'),
  fbCheck: () => ipcRenderer.invoke('fb:check'),
  fbDisconnect: () => ipcRenderer.invoke('fb:disconnect'),
  fbVerify: (code) => ipcRenderer.invoke('fb:verify', code),

  /* done, not asked */
  answer: (text) => ipcRenderer.send('worker:answer', text),
  openSite: () => ipcRenderer.send('app:open-site'),
  restart: () => ipcRenderer.send('app:restart'),
  pause: (next) => ipcRenderer.send('app:pause', next),
  mini: () => ipcRenderer.send('app:mini'),
  openMain: () => ipcRenderer.send('app:open-main'),
  quit: () => ipcRenderer.send('app:quit'),
});
