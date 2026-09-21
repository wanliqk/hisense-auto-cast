# 海信 WebMirror 协议记录

依据 `docs/hisense-source/index.html`、`webmirror.js` 和 `state-machine.min.js` 整理。后者是网页 UI 的通用状态机，不参与 WebSocket 媒体协议。

1. 网页连接 `wss://<电视 IP>:8765`；WebSocket `open` 后立即发送 JSON 文本 `Connect`。字段依次为 `security: [0]`、`protocolVersion: [1]`、`resolution: [1080,2160,720]`、`frameRate: [60,30]`、`format`、`deviceInfo`、`cmd: "Connect"`。`format` 按原源码候选顺序逐项通过 `MediaRecorder.isTypeSupported()` 筛选。`deviceInfo` 包含 browserType、browserVersion、osType、osVersion、userAgent、deviceID、deviceName。
2. 电视返回 JSON 文本 `ConnectACK`。仅 `result === "OK"` 可继续；保存 `security`、`protocolVersion`、`resolution`、`frameRate`、`format`。失败时记录完整响应并断开重连。
3. 用协商分辨率、帧率请求屏幕流。码率分别为 720P `1280*720*5`、1080P `1920*1080*5`、2160P `3840*2160*2.5`。MIME 为 `video/<format.video>`，有 codec 时追加 `; codecs = <format.codec>`。原网页调用 `MediaRecorder.start(1)`。
4. `ondataavailable` 得到非空 Blob 后，直接 `WebSocket.send(blob)`。原网页的默认 `slice` 为 0，因此每个 Blob 就是一个 Binary Message，没有额外帧头。每 100 包统计发送次数和字节数。
5. `Feedback` 为 JSON 文本：`{timestamp, bufferedAmount, recorderState, cmd:"Feedback"}`。约每 3 秒发送一次；每 200 ms 检查发送缓冲。`bufferedAmount > videoBitsPerSecond/4` 时暂停录制，低于 1024 时恢复，并立即发送相应状态的 Feedback。
6. 收到 `Finish` 时停止录制、屏幕流、定时器和 WebSocket。原网页在 45 秒未收到非空媒体 Blob 时停止；桌面客户端在此基础上自动重连。

原网页还包含音频输出检测及静音振荡器；当前客户端只采集配置网址对应窗口的视频，因此 `Connect.format` 仅声明原候选列表里经 `MediaRecorder.isTypeSupported()` 检测通过的纯视频格式。原网页的 `sendFinish(result)` 在正常停止流程中没有被调用，客户端也不主动增加这条消息。
