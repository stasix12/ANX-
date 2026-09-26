/*
 * The whole surface the window is given. Four channels, each one a sentence.
 *
 * The renderer has no Node, no file system and no network of its own: it is a
 * local HTML file whose only job is to show lines and send back what somebody
 * typed. Keeping that true is why this file is short enough to read.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('worker', {
  onLine: (fn) => ipcRenderer.on('worker:line', (_e, entry) => fn(entry)),
  onHistory: (fn) => ipcRenderer.on('worker:history', (_e, lines) => fn(lines)),
  onState: (fn) => ipcRenderer.on('worker:state', (_e, state) => fn(state)),
  answer: (text) => ipcRenderer.send('worker:answer', text),
  openSite: () => ipcRenderer.send('app:open-site'),
  restart: () => ipcRenderer.send('app:restart-worker'),
});
