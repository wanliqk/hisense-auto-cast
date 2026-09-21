# 海信自动投屏

Windows 桌面端 Electron 客户端。启动时打开独立网页窗口，只采集该窗口的视频并投送到固定 IP 的海信电视；断线后按 1、2、5、10 秒间隔重连。

## 运行

1. 在电视上开启“电脑投屏”服务，确认电脑能访问电视的 8765 端口。
2. 在 `config/config.json` 填入要打开的 `captureUrl`（默认 `https://example.com` 仅作占位），并按需修改 `tvHost`、`tvPort`、`windowWidth`、`windowHeight`。
3. 使用 Node.js 和 npm 运行 `npm install`、`npm start`。测试命令是 `npm test`。

## Windows EXE

运行 `npm run package:win`，产物位于 `dist/HisenseAutoCast-win32-x64/`。运行其中的 `HisenseAutoCast.exe`；请保持整个目录完整，修改同目录的 `config/config.json` 即可更改网址、电视 IP 和窗口尺寸。再次打包会保留该配置文件。

网址加载成功后，控制窗口会自动开始投屏。“停止投屏”会取消重连，“开始投屏”会重新连接。关闭任一窗口会退出应用。结构化日志输出到启动程序的终端，包含连接、协商、媒体统计、背压、超时与重连事件。

协议细节见 [docs/protocol.md](docs/protocol.md)。电视使用自签名证书时，仅配置的电视 IP 的颁发者或名称错误会被放行；其他证书错误仍由 Chromium 正常验证。
