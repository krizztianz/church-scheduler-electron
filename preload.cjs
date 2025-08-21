
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  generate: (args) => ipcRenderer.invoke('python:generate', { args }),
  openOutputFolder: (outputPath) => ipcRenderer.invoke('open:output-folder', outputPath)
});
