
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * Generate schedule.
   * @param {string[]} args - [MM, YYYY, pjemaatCount]
   * @returns {Promise<{code:number, stdout:string, stderr:string, outputPath:string}>}
   */
  generate: (args) => ipcRenderer.invoke('python:generate', { args })
});
