// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  generate: (payload) => ipcRenderer.invoke('generate', payload),
});

contextBridge.exposeInMainWorld('appInfo', {
  version: () => process.versions.electron,
  platform: () => process.platform,
});