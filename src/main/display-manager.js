const { desktopCapturer, screen } = require('electron');

function setupDisplayCapture(session, window, config, log) {
  const selectedId = () => String(config.displayId ?? screen.getPrimaryDisplay().id);

  session.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.frame !== window.webContents.mainFrame) {
      callback(null);
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'], thumbnailSize: { width: 0, height: 0 }
      });
      const source = sources.find(item => item.display_id === selectedId());
      if (!source) throw new Error(`未找到显示器 ${selectedId()}`);
      log('info', 'screen-source', { displayId: source.display_id, sourceId: source.id });
      callback({ video: source, ...(request.audioRequested ? { audio: 'loopback' } : {}) });
    } catch (error) {
      log('error', 'screen-source-failed', { message: error.message });
      callback(null);
    }
  });

  let currentId = selectedId();
  const notifyIfChanged = () => {
    const nextId = selectedId();
    if (nextId !== currentId) {
      currentId = nextId;
      log('info', 'primary-display-changed', { displayId: nextId });
      if (!window.isDestroyed()) window.webContents.send('display-changed', nextId);
    }
  };
  screen.on('display-added', notifyIfChanged);
  screen.on('display-removed', notifyIfChanged);
  screen.on('display-metrics-changed', notifyIfChanged);
  window.on('closed', () => {
    session.setDisplayMediaRequestHandler(null);
    screen.off('display-added', notifyIfChanged);
    screen.off('display-removed', notifyIfChanged);
    screen.off('display-metrics-changed', notifyIfChanged);
  });
}

module.exports = { setupDisplayCapture };
