const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
  openPath: (target) => ipcRenderer.invoke('open-path', target),
  onDownloadDone: (cb) => {
    ipcRenderer.on('download-done', (_event, info) => cb(info));
  },
});
