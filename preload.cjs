// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  generate: (args = []) => ipcRenderer.invoke('python:generate', args)
});

contextBridge.exposeInMainWorld('appInfo', {
  version: () => process.versions.electron,
  platform: () => process.platform,
});   