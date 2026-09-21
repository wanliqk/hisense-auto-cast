class MirrorClient {
  constructor(config, onUpdate, log) {
    this.config = config;
    this.onUpdate = onUpdate;
    this.log = log;
    this.state = 'DISCONNECTED';
    this.wanted = false;
    this.generation = 0;
    this.retryAttempt = 0;
    this.sentCount = 0;
    this.sentBytes = 0;
  }

  update(state, negotiated = this.negotiated ?? null) {
    this.state = state;
    this.onUpdate({ state, negotiated });
  }

  start() {
    if (this.wanted) return;
    this.wanted = true;
    this.retryAttempt = 0;
    this.connect();
  }

  stop() {
    this.wanted = false;
    this.cleanup();
    this.update('DISCONNECTED');
  }

  restart() {
    if (!this.wanted) return;
    this.log('info', 'connection-restart');
    this.cleanup();
    this.connect();
  }

  isCurrent(generation) {
    return this.wanted && this.generation === generation;
  }

  connect() {
    if (!this.wanted || this.socket || this.retryTimer) return;
    const generation = ++this.generation;
    this.update('CONNECTING', null);
    const url = `wss://${this.config.tvHost}:${this.config.tvPort}`;
    this.log('info', 'websocket-connecting', { url });
    try {
      const socket = new WebSocket(url);
      this.socket = socket;
      this.handshakeTimer = setTimeout(() => this.fail(generation, 'ConnectACK 超时'), 15000);
      socket.onopen = () => {
        if (!this.isCurrent(generation)) return;
        this.log('info', 'websocket-open');
        try {
          const formats = CastProtocol.supportedFormats().filter(format => !format.codec?.includes(','));
          const command = CastProtocol.connectCommand(this.deviceInfo(), formats);
          this.availableFormats = formats;
          socket.send(JSON.stringify(command));
          this.log('info', 'connect-sent', { command });
          this.update('NEGOTIATING', null);
        } catch (error) {
          this.fail(generation, error.message);
        }
      };
      socket.onmessage = event => this.handleMessage(generation, event.data);
      socket.onerror = () => this.fail(generation, 'WebSocket error');
      socket.onclose = event => {
        this.log('warn', 'websocket-close', { code: event.code, reason: event.reason });
        this.fail(generation, `WebSocket close ${event.code}`);
      };
    } catch (error) {
      this.fail(generation, error.message);
    }
  }

  deviceInfo() {
    let deviceID = localStorage.getItem('web_mirror_device_id');
    if (!deviceID) {
      deviceID = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
      localStorage.setItem('web_mirror_device_id', deviceID);
    }
    const userAgent = navigator.userAgent;
    return {
      browserType: 'Chrome', browserVersion: /Chrome\/([\d.]+)/.exec(userAgent)?.[1] ?? '',
      osType: 'Windows', osVersion: /Windows NT ([\d.]+)/.exec(userAgent)?.[1] ?? '',
      userAgent, deviceID, deviceName: `Windows电脑_${deviceID}`
    };
  }

  handleMessage(generation, data) {
    if (!this.isCurrent(generation)) return;
    try {
      const message = JSON.parse(data);
      if (message.cmd === 'Finish') {
        this.log('warn', 'finish-received', { message });
        this.fail(generation, '电视发送 Finish');
      } else if (message.cmd === 'ConnectACK' && this.state === 'NEGOTIATING') {
        this.log('info', 'connect-ack', { message });
        this.negotiated = CastProtocol.parseAck(message, this.availableFormats);
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        this.log('info', 'negotiated', this.negotiated);
        void this.beginCapture(generation);
      } else {
        this.log('warn', 'unknown-command', { message });
      }
    } catch (error) {
      this.fail(generation, error.message);
    }
  }

  async beginCapture(generation) {
    this.update('CAPTURING');
    try {
      // 等上一代未完成的请求结算，避免同时捕获两次窗口。
      if (this.capturePending) await this.capturePending.catch(() => {});
      if (!this.isCurrent(generation)) return;
      const pending = CastMedia.capture(this.negotiated);
      this.capturePending = pending;
      let stream;
      try {
        stream = await pending;
      } finally {
        if (this.capturePending === pending) this.capturePending = null;
      }
      if (!this.isCurrent(generation)) {
        for (const track of stream.getTracks()) {
          try { track.stop(); } catch (error) {
            this.log('error', 'stale-track-stop-failed', { message: error.message });
          }
        }
        return;
      }
      this.stream = stream;
      this.log('info', 'window-captured', {
        tracks: stream.getTracks().map(track => ({ kind: track.kind, settings: track.getSettings() }))
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('窗口流没有视频轨道');
      videoTrack.onended = () => this.fail(generation, '窗口捕获已结束');
      const { recorder, mimeType, videoBitsPerSecond } = CastMedia.createRecorder(stream, this.negotiated);
      this.recorder = recorder;
      this.videoBitsPerSecond = videoBitsPerSecond;
      this.log('info', 'recorder-mime', { mimeType, videoBitsPerSecond });
      recorder.ondataavailable = event => this.sendMedia(generation, event.data);
      recorder.onerror = event => this.fail(generation, `MediaRecorder error: ${event.error?.message ?? 'unknown'}`);
      recorder.start(1);
      this.log('info', 'recorder-started');
      this.resetWatchdog(generation);
      this.backpressureTimer = setInterval(() => this.checkBackpressure(generation), 200);
      const wasRetrying = this.retryAttempt > 0;
      this.retryAttempt = 0;
      if (wasRetrying) this.log('info', 'reconnect-success');
      this.update('STREAMING');
    } catch (error) {
      if (this.isCurrent(generation)) this.fail(generation, `捕获或录制失败: ${error.message}`);
    }
  }

  sendMedia(generation, blob) {
    if (!this.isCurrent(generation) || !blob || blob.size === 0) return;
    this.resetWatchdog(generation);
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(blob);
      this.sentCount++;
      this.sentBytes += blob.size;
      if (this.sentCount === 1 || this.sentCount % 100 === 0) {
        this.log('info', 'binary-sent', {
          sentCount: this.sentCount, sentBytes: this.sentBytes,
          bufferedAmount: this.socket.bufferedAmount
        });
      }
    } catch (error) {
      this.fail(generation, `媒体发送失败: ${error.message}`);
    }
  }

  sendFeedback(bufferedAmount, recorderState) {
    const command = {
      timestamp: Date.now(), bufferedAmount, recorderState, cmd: 'Feedback'
    };
    this.socket.send(JSON.stringify(command));
    this.lastFeedback = command.timestamp;
    this.log('info', 'feedback-sent', command);
  }

  checkBackpressure(generation) {
    if (!this.isCurrent(generation) || !this.recorder ||
        this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      const bufferedAmount = this.socket.bufferedAmount;
      let recorderState = this.recorder.state;
      if (bufferedAmount > this.videoBitsPerSecond / 4 && recorderState === 'recording') {
        this.recorder.pause();
        recorderState = 'paused';
        this.log('warn', 'recorder-pause', { bufferedAmount });
        this.sendFeedback(bufferedAmount, recorderState);
      } else if (bufferedAmount < 1024 && recorderState === 'paused') {
        this.recorder.resume();
        recorderState = 'recording';
        this.log('info', 'recorder-resume', { bufferedAmount });
        this.sendFeedback(bufferedAmount, recorderState);
      }
      if (Date.now() - (this.lastFeedback ?? 0) > 3000) {
        this.sendFeedback(bufferedAmount, recorderState);
      }
    } catch (error) {
      this.fail(generation, `背压处理失败: ${error.message}`);
    }
  }

  resetWatchdog(generation) {
    clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      this.log('error', 'watchdog-timeout');
      this.fail(generation, '45 秒没有媒体数据');
    }, 45000);
  }

  fail(generation, reason) {
    if (!this.isCurrent(generation)) return;
    this.log('error', 'mirror-failed', { reason });
    this.cleanup();
    const delay = [1000, 2000, 5000][this.retryAttempt] ?? 10000;
    this.retryAttempt++;
    this.update('RECONNECTING');
    this.log('info', 'reconnect-scheduled', { delay, attempt: this.retryAttempt });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  cleanup() {
    this.generation++;
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.watchdogTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.backpressureTimer);
    this.handshakeTimer = this.watchdogTimer = this.retryTimer = this.backpressureTimer = null;
    if (this.recorder) {
      this.recorder.ondataavailable = this.recorder.onerror = null;
      if (this.recorder.state !== 'inactive') {
        try { this.recorder.stop(); } catch (error) {
          this.log('error', 'recorder-stop-failed', { message: error.message });
        }
      }
    }
    this.recorder = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.onended = null;
        try { track.stop(); } catch (error) {
          this.log('error', 'track-stop-failed', { message: error.message });
        }
      }
    }
    this.stream = null;
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      try { this.socket.close(); } catch (error) {
        this.log('error', 'websocket-close-failed', { message: error.message });
      }
    }
    this.socket = null;
    this.negotiated = null;
    this.availableFormats = null;
    this.videoBitsPerSecond = null;
    this.lastFeedback = null;
    this.sentCount = this.sentBytes = 0;
  }
}

if (typeof module !== 'undefined') module.exports = MirrorClient;
