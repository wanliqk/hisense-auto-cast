const { app, BrowserWindow, ipcMain, session } = require('electron');
const { readFileSync } = require('node:fs');
const { isIP } = require('node:net');
const path = require('node:path');
const { trustConfiguredTv } = require('./certificate');
const { setupDisplayCapture } = require('./display-manager');

const log = (level, event, details = {}) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, event, ...details }));
};

let config;
try {
  config = JSON.parse(readFileSync(path.join(__dirname, '../../config/config.json'), 'utf8'));
  if (!isIP(config.tvHost) || !Number.isInteger(config.tvPort) ||
      config.tvPort < 1 || config.tvPort > 65535 ||
      (config.displayId != null && !Number.isInteger(config.displayId))) {
    throw new Error('tvHost 必须是 IP，tvPort 必须是有效端口，displayId 必须是整数或 null');
  }
} catch (error) {
  log('error', 'config-failed', { message: error.message });
  process.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else app.whenReady().then(() => {
  log('info', 'app-start', { tvHost: config.tvHost, tvPort: config.tvPort });
  trustConfiguredTv(session.defaultSession, config.tvHost, log);
  const window = new BrowserWindow({
    width: 420, height: 330, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('get-config', event => event.sender === window.webContents ? config : null);
  ipcMain.on('cast-log', (event, level, name, details) => {
    if (event.sender === window.webContents && ['info', 'warn', 'error'].includes(level) &&
        typeof name === 'string' && details && typeof details === 'object') {
      log(level, name, details);
    }
  });
  setupDisplayCapture(session.defaultSession, window, config, log);
  window.loadFile(path.join(__dirname, '../renderer/index.html')).catch(error => {
    log('error', 'window-load-failed', { message: error.message });
    app.quit();
  });
  window.on('closed', () => app.quit());
}).catch(error => {
  log('error', 'app-start-failed', { message: error.message });
  app.quit();
});
