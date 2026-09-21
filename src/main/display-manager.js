const { desktopCapturer } = require('electron');

function setupDisplayCapture(session, controlWindow, browserWindow, log) {
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.frame !== controlWindow.webContents.mainFrame || browserWindow.isDestroyed()) {
      callback(null);
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'], thumbnailSize: { width: 0, height: 0 }
      });
      const sourceId = browserWindow.getMediaSourceId();
      const windowHandle = sourceId.split(':')[1];
      const source = sources.find(item => item.id.startsWith(`window:${windowHandle}:`));
      if (!source) throw new Error(`未找到网页窗口 ${sourceId}`);
      log('info', 'window-source', { sourceId });
      callback({ video: source });
    } catch (error) {
      log('error', 'window-source-failed', { message: error.message });
      callback(null);
    }
  });

  controlWindow.on('closed', () => {
    session.setDisplayMediaRequestHandler(null);
  });
}

module.exports = { setupDisplayCapture };
