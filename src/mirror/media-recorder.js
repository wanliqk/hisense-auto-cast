const CastMedia = (() => {
  async function capture(negotiated) {
    const [width, height] = CastProtocol.resolutions[negotiated.resolution];
    return navigator.mediaDevices.getDisplayMedia({
      video: { width, height, frameRate: negotiated.frameRate, displaySurface: 'monitor' },
      audio: negotiated.format.codec == null || negotiated.format.codec.includes(',')
    });
  }

  function createRecorder(stream, negotiated) {
    const mimeType = CastProtocol.mimeType(negotiated.format);
    if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error(`MIME 不受支持: ${mimeType}`);
    const videoBitsPerSecond = CastProtocol.videoBitsPerSecond(negotiated.resolution);
    return {
      recorder: new MediaRecorder(stream, {
        mimeType, videoBitsPerSecond, ignoreMutedMedia: false
      }),
      mimeType, videoBitsPerSecond
    };
  }

  function keepAudioActive(stream) {
    if (!stream.getAudioTracks().length) return null;
    // 原网页用近乎静音的振荡器避免无系统声音时录制器停止产出数据。
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 0.001;
    gain.gain.value = 0.001;
    oscillator.connect(gain);
    gain.connect(context.destination);
    try { oscillator.start(); } catch (error) {
      void context.close();
      throw error;
    }
    return { oscillator, context };
  }

  return { capture, createRecorder, keepAudioActive };
})();
