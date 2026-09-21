# 海信自动投屏

Windows 桌面端 Electron 客户端。启动后连接固定 IP 的海信电视“电脑投屏”服务，自动选择主显示器并投屏，断线后按 1、2、5、10 秒间隔重连。

## 运行

1. 在电视上开启“电脑投屏”服务，确认电脑能访问电视的 8765 端口。
2. 按需修改 `config/config.json` 的 `tvHost` 和 `tvPort`。`displayId` 默认是 `null`（每次采集使用当前 Windows 主显示器），以后可填 Electron `screen` 的显示器整数 ID。
3. 使用 Node.js 和 npm 运行 `npm install`、`npm start`。测试命令是 `npm test`。

界面会自动开始投屏，“停止投屏”会取消重连，“开始投屏”会重新连接。结构化日志输出到启动程序的终端，包含连接、协商、媒体统计、背压、超时与重连事件。

协议细节见 [docs/protocol.md](docs/protocol.md)。电视使用自签名证书时，仅配置的电视 IP 的颁发者或名称错误会被放行；其他证书错误仍由 Chromium 正常验证。
