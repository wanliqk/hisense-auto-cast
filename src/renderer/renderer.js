const statusText = {
  DISCONNECTED: '● 已断开', CONNECTING: '● 正在连接',
  NEGOTIATING: '● 正在协商', CAPTURING: '● 正在获取屏幕',
  STREAMING: '● 投屏中', RECONNECTING: '● 等待重连'
};

const tv = document.getElementById('tv');
const status = document.getElementById('status');
const negotiatedText = document.getElementById('negotiated');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');

window.castApp.getConfig().then(config => {
  if (!config) throw new Error('无法读取配置');
  tv.textContent = `${config.tvHost}:${config.tvPort}`;
  const client = new MirrorClient(config, ({ state, negotiated }) => {
    status.textContent = statusText[state];
    negotiatedText.textContent = negotiated
      ? `${negotiated.resolution}P / ${negotiated.frameRate} FPS · ${negotiated.format.video.toUpperCase()} / ${negotiated.format.codec?.toUpperCase() ?? '默认编码'}`
      : '—';
    startButton.disabled = client.wanted;
    stopButton.disabled = !client.wanted;
  }, (level, event, details) => window.castApp.log(level, event, details));
  startButton.addEventListener('click', () => client.start());
  stopButton.addEventListener('click', () => client.stop());
  window.castApp.onDisplayChanged(() => client.restartForDisplay());
  window.addEventListener('online', () => client.restartForDisplay());
  window.addEventListener('beforeunload', () => client.stop());
  client.start();
}).catch(error => {
  status.textContent = `启动失败：${error.message}`;
  window.castApp.log('error', 'renderer-start-failed', { message: error.message });
});
