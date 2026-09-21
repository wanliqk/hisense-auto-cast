const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../src/mirror/protocol');
const MirrorClient = require('../src/mirror/mirror-client');
const { trustConfiguredTv } = require('../src/main/certificate');

test('证书例外仅限配置电视的自签名/名称错误', () => {
  const session = { setCertificateVerifyProc(handler) { this.handler = handler; } };
  trustConfiguredTv(session, '192.168.110.215', () => {});
  const verify = request => {
    let result;
    session.handler(request, value => { result = value; });
    return result;
  };
  assert.equal(verify({ hostname: '192.168.110.215', verificationResult: 'CERT_AUTHORITY_INVALID' }), 0);
  assert.equal(verify({ hostname: '192.168.110.216', verificationResult: 'CERT_AUTHORITY_INVALID' }), -3);
  assert.equal(verify({ hostname: '192.168.110.215', verificationResult: 'CERT_REVOKED' }), -3);
});

test('Connect/ACK 格式及协商参数保持与原网页一致', () => {
  const formats = protocol.supportedFormats({ isTypeSupported: mime => mime === 'video/webm; codecs = vp8' });
  const command = protocol.connectCommand({ deviceID: '100001' }, formats);
  assert.deepEqual(command.format, [{ video: 'webm', codec: 'vp8' }]);
  assert.equal(command.cmd, 'Connect');
  assert.deepEqual(command.resolution, [1080, 2160, 720]);
  const ack = { cmd: 'ConnectACK', result: 'OK', security: 0, protocolVersion: 1,
    resolution: 1080, frameRate: 60, format: formats[0] };
  assert.deepEqual(protocol.parseAck(ack, formats).format, formats[0]);
  assert.equal(protocol.videoBitsPerSecond(1080), 1920 * 1080 * 5);
  assert.throws(() => protocol.parseAck({ ...ack, result: 'BUSY' }, formats));
  assert.throws(() => protocol.parseAck({ ...ack, format: { video: 'mp4', codec: 'h264' } }, formats));
});

test('断线清理录制和定时器，只安排一次重连', async () => {
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    constructor() { this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  }
  const tracks = [{ kind: 'video', stopped: false, getSettings: () => ({}), stop() { this.stopped = true; } }];
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks, getAudioTracks: () => [] };
  const recorder = {
    state: 'inactive', start() { this.state = 'recording'; },
    stop() { this.state = 'inactive'; }, pause() { this.state = 'paused'; },
    resume() { this.state = 'recording'; }
  };
  global.WebSocket = FakeSocket;
  global.MediaRecorder = { isTypeSupported: mime => mime === 'video/webm; codecs = vp8' };
  global.CastProtocol = protocol;
  global.CastMedia = { capture: async () => stream, keepAudioActive: () => null, createRecorder: () =>
    ({ recorder, mimeType: 'video/webm; codecs = vp8', videoBitsPerSecond: 10000 }) };
  global.localStorage = { getItem: () => '100001' };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent: 'Chrome/152.0 Windows NT 10.0' } });
  const client = new MirrorClient({ tvHost: '192.168.110.215', tvPort: 8765 }, () => {}, () => {});
  client.start();
  client.start();
  assert.equal(sockets.length, 1);
  const socket = sockets[0];
  socket.readyState = 1;
  socket.onopen();
  assert.equal(JSON.parse(socket.sent[0]).cmd, 'Connect');
  socket.onmessage({ data: JSON.stringify({ cmd: 'ConnectACK', result: 'OK', security: 0,
    protocolVersion: 1, resolution: 1080, frameRate: 60,
    format: { video: 'webm', codec: 'vp8' } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.state, 'STREAMING');
  recorder.ondataavailable({ data: new Blob(['abc']) });
  assert.equal(socket.sent[1] instanceof Blob, true);
  socket.bufferedAmount = 3000;
  client.checkBackpressure(client.generation);
  assert.equal(recorder.state, 'paused');
  socket.bufferedAmount = 0;
  client.checkBackpressure(client.generation);
  assert.equal(recorder.state, 'recording');
  socket.onclose({ code: 1006, reason: '' });
  assert.equal(client.state, 'RECONNECTING');
  assert.equal(tracks[0].stopped, true);
  assert.equal(recorder.state, 'inactive');
  assert.equal(sockets.length, 1);
  client.stop();
  assert.equal(client.state, 'DISCONNECTED');
});
