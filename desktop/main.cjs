const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.webmanifest': 'application/manifest+json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
};

const BASE_PORT = 47821;
const MAX_TRIES = 5;

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

function uniqueDownloadPath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

async function startServer() {
  const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(ROOT)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      try {
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
      } catch (e) {
        res.statusCode = 500;
        res.end('read error');
      }
  });

  // 端口固定，保证 IndexedDB 的 origin 不变，重启后数据还在
  for (let i = 0; i < MAX_TRIES; i++) {
    try {
      return await listen(server, BASE_PORT + i);
    } catch (e) {
      if (i === MAX_TRIES - 1) throw e;
    }
  }
  throw new Error('no port');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const port = await startServer();
    const origin = `http://127.0.0.1:${port}`;

    const win = new BrowserWindow({
      width: 1240,
      height: 880,
      minWidth: 380,
      minHeight: 560,
      title: '报销助手',
      backgroundColor: '#F2F2F7',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // 导出直接落到「下载」目录，不弹系统另存为
    win.webContents.session.on('will-download', (event, item) => {
      const target = uniqueDownloadPath(app.getPath('downloads'), item.getFilename());
      item.setSavePath(target);
      item.once('done', (_e, state) => {
        if (state === 'completed' && !win.isDestroyed()) {
          win.webContents.send('download-done', { name: path.basename(target), path: target });
        }
      });
    });

    ipcMain.handle('open-path', async (_e, target) => {
      if (typeof target !== 'string' || !fs.existsSync(target)) return 'not found';
      return shell.openPath(target);
    });

    // 本地文件不需要 Service Worker，启动前清掉旧版本留下的 SW 与缓存，避免加载到旧代码
    try {
      await win.webContents.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    } catch (e) {
      /* 清不掉就继续，页面里还有兜底 */
    }

    win.loadURL(`${origin}/`);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(origin)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(origin)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
  });

  app.on('window-all-closed', () => app.quit());
}
