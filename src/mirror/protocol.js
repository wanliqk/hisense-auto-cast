const CastProtocol = (() => {
  const formats = [
    { video: 'webm', codec: 'h264,pcm' },
    { video: 'webm', codec: 'h264,opus' },
    { video: 'webm', codec: 'vp9,opus' },
    { video: 'webm', codec: 'vp8,opus' },
    { video: 'webm', codec: 'h264' },
    { video: 'webm', codec: 'vp8' },
    { video: 'webm', codec: 'vp9' },
    { video: 'mp4', codec: 'h264' },
    { video: 'webm', codec: null },
    { video: 'mp4', codec: null }
  ];
  const resolutions = { 720: [1280, 720, 5], 1080: [1920, 1080, 5], 2160: [3840, 2160, 2.5] };

  const mimeType = format => `video/${format.video}` +
    (format.codec == null ? '' : `; codecs = ${format.codec}`);

  function supportedFormats(recorder = MediaRecorder) {
    return formats.filter(format => recorder.isTypeSupported(mimeType(format)));
  }

  function connectCommand(deviceInfo, availableFormats) {
    if (!availableFormats.length) throw new Error('MediaRecorder 不支持海信要求的格式');
    return {
      security: [0], protocolVersion: [1], resolution: [1080, 2160, 720],
      frameRate: [60, 30], format: availableFormats, deviceInfo, cmd: 'Connect'
    };
  }

  function parseAck(message, availableFormats) {
    if (message?.cmd !== 'ConnectACK' || message.result !== 'OK') {
      throw new Error(`ConnectACK 失败: ${JSON.stringify(message)}`);
    }
    const validFormat = availableFormats.some(format =>
      format.video === message.format?.video && format.codec === message.format?.codec);
    if (message.security !== 0 || message.protocolVersion !== 1 ||
        !Object.hasOwn(resolutions, message.resolution) ||
        ![30, 60].includes(message.frameRate) || !validFormat) {
      throw new Error(`ConnectACK 参数无效: ${JSON.stringify(message)}`);
    }
    return {
      security: message.security, protocolVersion: message.protocolVersion,
      resolution: message.resolution, frameRate: message.frameRate, format: message.format
    };
  }

  function videoBitsPerSecond(resolution) {
    const [width, height, multiplier] = resolutions[resolution];
    return width * height * multiplier;
  }

  return { supportedFormats, connectCommand, parseAck, mimeType, resolutions, videoBitsPerSecond };
})();

if (typeof module !== 'undefined') module.exports = CastProtocol;
