const { app, BrowserWindow, ipcMain, session } = require('electron');
const { existsSync, readFileSync } = require('node:fs');
const { isIP } = require('node:net');
const path = require('node:path');
const { trustConfiguredTv } = require('./certificate');
const { setupDisplayCapture } = require('./display-manager');

const log = (level, event, details = {}) => {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, event, ...details }));
};

let config;
try {
  const externalConfig = path.join(path.dirname(process.execPath), 'config/config.json');
  const configFile = existsSync(externalConfig)
    ? externalConfig : path.join(__dirname, '../../config/config.json');
  config = JSON.parse(readFileSync(configFile, 'utf8'));
  const captureUrl = new URL(config.captureUrl);
  if (!isIP(config.tvHost) || !Number.isInteger(config.tvPort) ||
      config.tvPort < 1 || config.tvPort > 65535 ||
      !['http:', 'https:'].includes(captureUrl.protocol) ||
      !Number.isInteger(config.windowWidth) || config.windowWidth < 320 ||
      !Number.isInteger(config.windowHeight) || config.windowHeight < 240) {
    throw new Error('请检查 tvHost、tvPort、captureUrl、windowWidth 和 windowHeight');
  }
} catch (error) {
  log('error', 'config-failed', { message: error.message });
  process.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else app.whenReady().then(async () => {
  log('info', 'app-start', { tvHost: config.tvHost, tvPort: config.tvPort,
    captureOrigin: new URL(config.captureUrl).origin });
  trustConfiguredTv(session.defaultSession, config.tvHost, log);
  const browserWindow = new BrowserWindow({
    title: '投屏网页', width: config.windowWidth, height: config.windowHeight,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browserWindow.on('closed', () => app.quit());
  const window = new BrowserWindow({
    parent: browserWindow,
    width: 420, height: 350, autoHideMenuBar: true, show: false,
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
  setupDisplayCapture(session.defaultSession, window, browserWindow, log);
  window.on('closed', () => app.quit());
  try {
    await browserWindow.loadURL(config.captureUrl);
    log('info', 'browser-window-loaded', { origin: new URL(browserWindow.webContents.getURL()).origin });
    await window.loadFile(path.join(__dirname, '../renderer/index.html'));
    window.show();
  } catch (error) {
    log('error', 'window-load-failed', { message: error.message });
    app.quit();
  }
}).catch(error => {
  log('error', 'app-start-failed', { message: error.message });
  app.quit();
});
