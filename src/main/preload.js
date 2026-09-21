const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('castApp', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  log: (level, event, details = {}) => ipcRenderer.send('cast-log', level, event, details)
});
