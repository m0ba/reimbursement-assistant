const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
});
