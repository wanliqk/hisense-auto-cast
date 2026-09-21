const CastMedia = (() => {
  async function capture(negotiated) {
    const [width, height] = CastProtocol.resolutions[negotiated.resolution];
    return navigator.mediaDevices.getDisplayMedia({
      video: { width, height, frameRate: negotiated.frameRate, displaySurface: 'window' },
      audio: false
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

  return { capture, createRecorder };
})();

if (typeof module !== 'undefined') module.exports = CastMedia;
