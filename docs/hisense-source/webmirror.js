const WebMirrorError = {
    WEBSOCKET_NOT_SUPPORT: 'websocket_not_support',
    WEBSOCKET_CONNECT_ERROR: "websocket_connect_error",
    WEBSOCKET_BREAK: "websocket_break",
    USER_REFUSED: "user_refused_error",
    PROTOCOL_NEGOTIATION_ERROR: "protocol_negotiation_error",
    MEDIA_RECORDER_ERROR: "media_recorder_error"
}

const WebMirrorCode = {
    UNKNOWN: 'UNKNOWN',
    OK: 'OK',
    PENDING: 'PENDING',
    BUSY: 'BUSY',
    REFUSED: 'REFUSED',
    STATE_NOT_ALLOW: 'STATE_NOT_ALLOW',
    SERVER_ERROR: 'SERVER_ERROR',
    RESOURCE_UNAVAILABLE: 'RESOURCE_UNAVAILABLE',
    ERROR_CMD: 'ERROR_CMD',
    ERROR_SECURITY: 'ERROR_SECURITY',
    ERROR_PROTOCOL_VERSION: 'ERROR_PROTOCOL_VERSION',
    ERROR_RESOLUTION: 'ERROR_RESOLUTION',
    ERROR_FRAMERATE: 'ERROR_FRAMERATE',
    ERROR_FORMAT: 'ERROR_FORMAT',
}

const WebMirrorState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: "connecting",
    CONNECTED: "connected",
}

const WebMirrorNegotiateState = {
    CONTINUE: 0,
    DONE: 1,
    FAIL: 2,
    NOT_CARE: 3,
}

const WebMirrorConfig = {
    securityList: [0],
    protocolVersionList: [1],
    resolutionList: [1080, 2160, 720],
    frameRateList: [60, 30],
    supportFormatList: null,
    detectFormatList: [
        //chrome and edge
        {
            "video": "webm",
            "codec": "h264,pcm"
        },
        {
            "video": "webm",
            "codec": "h264,opus"
        },
        {
            "video": "webm",
            "codec": "vp9,opus"
        },
        {
            "video": "webm",
            "codec": "vp8,opus"
        },
        //chrome and edge
        {
            "video": "webm",
            "codec": "h264"
        },
        //firefox
        {
            "video": "webm",
            "codec": "vp8"
        },
        //other
        {
            "video": "webm",
            "codec": "vp9"
        },
        {
            "video": "mp4",
            "codec": "h264"
        },
        {
            "video": "webm",
            "codec": null
        },
        //兼容safari
        {
            "video": "mp4",
            "codec": null
        }
    ],

    get formatList() {
        if (!this.supportFormatList) {
            this.supportFormatList = [];
            WebMirrorConfig.detectFormatList.forEach(format => {
                let mimeType = 'video/' + format['video'];
                if (format['codec'] != null) {
                    mimeType += '; codecs = ' + format['codec'];
                }
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    console.log(mimeType + ' is support');
                    this.supportFormatList.push(format);
                }
            });
        }
        return this.supportFormatList;
    }
}

const WebMirrorUtil = {
    // https://github.com/faisalman/ua-parser-js/tree/f54d3fadac6c57733db3ae2f49570703ce388192
    deviceInfo: null,

    getDeviceID() {
        let saveID = localStorage.getItem('web_mirror_device_id');
        if (saveID == null) {
            let random = Math.trunc(Math.random() * 1000000);
            if (random < 100000) {
                random += 100000; //len = 6
            }
            saveID = '' + random;
            localStorage.setItem('web_mirror_device_id', saveID);
        }
        return saveID;
    },

    getDeviceInfo() {
        if (WebMirrorUtil.deviceInfo == null) {
            let deviceInfo = {};
            let parser = new UAParser();
            deviceInfo['browserType'] = parser.getBrowser().name;
            deviceInfo['browserVersion'] = parser.getBrowser().version;
            deviceInfo['osType'] = parser.getOS().name;
            deviceInfo['osVersion'] = parser.getOS().version;
            deviceInfo['userAgent'] = parser.getUA();
            deviceInfo['deviceID'] = WebMirrorUtil.getDeviceID();
            deviceInfo['deviceName'] = deviceInfo['osType'] + '电脑_' + deviceInfo['deviceID'];
            WebMirrorUtil.deviceInfo = deviceInfo;
        }
        return WebMirrorUtil.deviceInfo;
    },

    isSupportMirror() {
        if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            console.error('not SupportMirror: getDisplayMedia error');
            return false;
        }
        if (WebMirrorConfig.resolutionList.length == 0) {
            console.error('not SupportMirror: resolutionList.length is 0');
            return false;
        }

        if (!("WebSocket" in window)) {
            console.error('not SupportMirror: no WebSocket');
            return false;
        }

        let browser = WebMirrorUtil.getDeviceInfo().browserType;
        if (browser.includes('IE')
            || browser.includes('Firefox')
            //|| browser.includes('Safari')
        ) {
            console.error('not Suppor for browser ' + browser);
            return false;
        }

        return true;
    },

    //Firefox和Safari要求在Gesture线程中处理getDisplayMedia，网络连接在前会导致个别情况下getDisplayMedia失败
    isRequireGetDisplayMediaFromGesture() {
        let browser = WebMirrorUtil.getDeviceInfo().browserType;
        let isRequire = false;
        if (browser.includes('Firefox') || browser.includes('Safari')) {
            isRequire = true;
        }
        console.log('isRequireGetDisplayMediaFromGesture: ' + isRequire + ' for ' + browser);
        return isRequire;
    },

    async getAudioSupport() {
        let hasAudioOutputDevice = false;
        try {
            let devices = await navigator.mediaDevices.enumerateDevices();
            devices.forEach(device => {
                if (device.kind === 'audiooutput') {
                    hasAudioOutputDevice = true;
                    console.log('found audio output device: ' + device);
                    console.log(device);
                }
            });
        } catch (error) {
            console.error("enumerateDevices error: " + error);
        }
        if (hasAudioOutputDevice) {
            return {
                //latency: 0,
                sampleSize: 16,
                sampleRate: 48000,
                channelCount: 2,
                //自动增益控制
                autoGainControl: false,
                //回声消除
                echoCancellation: false,
                //噪声抑制
                noiseSuppression: false
            }
        } else {
            console.log('no audio output devices');
            return false;
        }
    },
}

class Watchdog {
    constructor() {
        this.timeout = null;
        this.timeoutId = null;
        this.action = null;
    }

    // 设置超时时间和超时后的动作
    setup(timeout, action) {
        this.timeout = timeout;
        this.action = action;
    }

    // 启动看门狗
    start() {
        if (this.timeoutId) {
            console.warn("Watchdog is already running.");
            return;
        }
        this.timeoutId = setTimeout(this.action, this.timeout);
    }

    // 停止看门狗
    stop() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        } else {
            console.warn("Watchdog is not running.");
        }
    }

    // 喂狗，重置计时器
    reset() {
        this.stop();
        this.start();
    }
}

class TimedLoopExecutor {

    /**
     * 构造函数
     * @param {number} interval 检测间隔时间（毫秒）
     * @param {function} action 执行的动作
     */
    constructor(interval, action) {
        this.interval = interval;
        this.action = action;
        this.timer = null;
    }

    /**
     * 开始监控
     */
    start() {
        if (this.timer) {
            this.stop();
        }

        this.timer = setInterval(() => {
            this.action();
        }, this.interval);
    }

    /**
     * 停止监控
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

}

class WebMirrorManager {
    static getMirrorClient() {
        if (!WebMirrorManager._clientInstance) {
            WebMirrorManager._clientInstance = new WebMirrorClient();
        }
        return WebMirrorManager._clientInstance;
    }
}

class WebMirrorClient {
    constructor() {
        this.securityList = WebMirrorConfig.securityList;
        this.protocolVersionList = WebMirrorConfig.protocolVersionList;
        this.deviceInfo = WebMirrorUtil.getDeviceInfo();
        this.resolutionList = WebMirrorConfig.resolutionList;
        this.frameRateList = WebMirrorConfig.frameRateList;
        this.formatList = WebMirrorConfig.formatList;

        console.log('WebMirrorClient securityList: ' + this.securityList);
        console.log('WebMirrorClient protocolVersionList: ' + this.protocolVersionList);
        console.log('WebMirrorClient deviceInfo: ');
        console.log(this.deviceInfo);
        console.log('WebMirrorClient resolutionList: ' + this.resolutionList);
        console.log('WebMirrorClient frameRateList: ' + this.frameRateList);
        console.log('WebMirrorClient formatList: ');
        console.log(this.formatList);

        this.onStart = null;
        this.onStop = null;
        this.onError = null;

        this.state = WebMirrorState.DISCONNECTED;
        this.negotiateState = WebMirrorNegotiateState.CONTINUE;

        this.slice = 0;

        this.security = null;
        this.protocolVersion = null;
        this.resolution = null;
        this.frameRate = null;
        this.format = null;
        this.videoBitsPerSecond = null;

        this.socket = null;
        this.stream = null;
        this.mediaRecorder = null;
        this.watchdog = null;

        this.videoTrack = null;
        this.audioTrack = null;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.oscillator = null;

        this.lastFeedBackTime = 0;
        this.timedLoopExecutor = null;

        this.debugLog = false;
        this.totolSendBytes = 0;
        this.totolSendTimes = 0;
    }

    callbackErrorAndStopMirror(err) {
        this.callbackError(err);
        this.stopMirror();
    }

    callbackError(err) {
        console.log('callbackError: ' + err);
        if (this.onError) {
            this.onError(err);
        } else {
            console.error('no onError handler: ' + err);
        }
    }

    callbackStart() {
        console.log('callbackStart');
        if (this.onStart) {
            this.onStart();
        } else {
            console.error('no onStart handler');
        }
    }

    callbackStop() {
        console.log('callbackStop');
        if (this.onStop) {
            this.onStop();
        } else {
            console.error('no disconnect handler');
        }
    }

    async connectAndNegotiate(ip, port) {
        console.log('connectSocket ip: ' + ip + ', port: ' + port);
        this.ip = ip;
        this.port = port;
        return new Promise((resolve, reject) => {
            if ("WebSocket" in window) {
                // 打开一个 web socket
                let socket = new WebSocket("wss://" + ip + ":" + port);

                // 连接建立后的回调函数
                socket.onopen = () => {
                    // Web Socket 已连接上，使用 send() 方法发送数据
                    console.log("WebSocket onopen");
                    this.socket = socket;
                    //开始指令协商，会在socket.onmessage处理协商过程
                    this.sendConnect();
                };

                // 接收到服务器消息后的回调函数
                socket.onmessage = (evt) => {
                    console.log("WebSocket onmessage： " + evt.data);
                    if (this.negotiateState == WebMirrorNegotiateState.CONTINUE) {
                        let negotiateResult = this.handleWebSocketMessage(evt);
                        if (negotiateResult == WebMirrorNegotiateState.DONE) {
                            this.negotiateState = WebMirrorNegotiateState.DONE;
                            console.log("negotiate done");
                            resolve(socket);
                        } else if (negotiateResult == WebMirrorNegotiateState.FAIL) {
                            this.negotiateState = WebMirrorNegotiateState.FAIL;
                            console.log("negotiate fail");
                            reject(WebMirrorError.PROTOCOL_NEGOTIATION_ERROR);
                        } else {
                            // WebMirrorNegotiateState.CONTINUE;
                            // WebMirrorNegotiateState.NOT_CARE;
                        }
                    }

                };

                // 连接关闭后的回调函数
                socket.onclose = () => {
                    // 关闭 websocket
                    console.log("WebSocket onclose");
                    this.stopMirror();
                    this.negotiateState = WebMirrorNegotiateState.CONTINUE;
                    this.state = WebMirrorState.DISCONNECTED;
                    this.callbackStop();
                };

                // 连接错误后的回调函数
                socket.onerror = (event) => {
                    // websocket 错误
                    console.log("WebSocket onerror： " + event);
                    console.log(event);
                    reject(WebMirrorError.WEBSOCKET_CONNECT_ERROR);
                };
            } else {
                // 浏览器不支持 WebSocket
                console.log("Browser not support WebSocket!");
                reject(WebMirrorError.WEBSOCKET_NOT_SUPPORT);
            }
        })
    }

    handleWebSocketMessage(evt) {
        let msg = evt.data;
        console.log("handleWebSocketMessage：" + msg);

        let command;
        try {
            command = JSON.parse(msg);
        } catch (e) {
            console.log("JSON parse error：");
            console.log(e);
            return WebMirrorNegotiateState.FAIL;
        }

        let cmd = command['cmd'];
        switch (cmd) {
            case 'ConnectACK':
                return this.handleConnectACK(command);
            case 'Finish':
                return this.handleFinish(command);
            default:
                console.error("unknown cmd: " + msg);
                return
        }
    }

    handleConnectACK(command) {
        if (command.result != WebMirrorCode.OK) {
            console.error('handleConnectACK got error result ' + command.result);
            this.callbackErrorAndStopMirror(WebMirrorError.PROTOCOL_NEGOTIATION_ERROR);
            return WebMirrorNegotiateState.FAIL;
        }

        this.security = command.security;
        this.protocolVersion = command.protocolVersion;
        this.resolution = command.resolution;
        this.frameRate = command.frameRate;
        this.format = command.format;

        return WebMirrorNegotiateState.DONE;
    }

    handleFinish(command) {
        console.log('handleFinish: ' + command);
        this.stopMirror();
    }

    sendWebSocketMessage(msg) {
        if (this.socket && this.socket.readyState == WebSocket.OPEN) {
            this.socket.send(msg);
        } else {
            console.error("sendWebSocketMessage error, not open：" + msg);
        }
    }

    sendRecordData(data) {
        if (this.socket && this.socket.readyState == WebSocket.OPEN) {
            if (this.debugLog) {
                console.debug("sendRecordData: " + data.size + ", bufferedAmount: " + this.socket.bufferedAmount);
            }
            this.socket.send(data);
            this.totolSendBytes += data.size;
            this.totolSendTimes += 1;
            if (this.totolSendTimes % 100 == 0) {
                console.log("sendRecordData: totolSendBytes " + this.totolSendBytes + ", totolSendTimes: " + this.totolSendTimes);
            }
        } else {
            console.error("sendRecordData error, not open：" + data);
        }
    }

    sendCommand(cmd, command) {
        command['cmd'] = cmd;
        let msg = JSON.stringify(command);
        console.log("sendCommand: " + msg);
        this.sendWebSocketMessage(msg);
    }

    sendConnect() {
        let command = {};
        command['security'] = this.securityList;
        command['protocolVersion'] = this.protocolVersionList;
        command['resolution'] = this.resolutionList;
        command['frameRate'] = this.frameRateList;
        command['format'] = this.formatList;
        command['deviceInfo'] = this.deviceInfo;
        this.sendCommand("Connect", command);
    }

    sendFeedback(bufferedAmount, recorderState) {
        let command = {};
        this.lastFeedBackTime = Date.now();
        command['timestamp'] = this.lastFeedBackTime;
        command['bufferedAmount'] = bufferedAmount;
        command['recorderState'] = recorderState;
        this.sendCommand("Feedback", command);
    }

    sendFinish(code) {
        let command = {};
        command['result'] = code;
        this.sendCommand("Finish", command);
    }

    requireMediaStream(resolution, frameRate) {
        //默认1080
        let width = 1920;
        let height = 1080;;
        if (resolution == 1080) {
            width = 1920;
            height = 1080;
        } else if (resolution == 720) {
            width = 1280;
            height = 720;
        } else if (resolution == 2160) {
            width = 3840;
            height = 2160;
        }
        console.log('requireMediaStream resolution ' + resolution + ', width ' + width + ', height ' + height + ', frameRate ' + frameRate);

        return WebMirrorUtil.getAudioSupport().then((audioSupport) => {
            let constraints = {
                video: {
                    //修改视频宽高
                    width: width,
                    height: height,
                    //设置帧率
                    frameRate: frameRate,
                    displaySurface: "monitor"
                },
                audio: audioSupport
            }
            console.log(constraints);
            return constraints;
        }).then((constraints) => navigator.mediaDevices.getDisplayMedia(constraints));
    }

    //将流赋值给video标签
    processMediaStream(stream) {
        console.log('processMediaStream ' + stream);
        console.log(stream);
        this.stream = stream;
        //视频的所有轨
        var tracks = stream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            var track = tracks[i];
            if (track.kind == 'video') {
                this.videoTrack = track;
                track.onended = () => {
                    console.log("videoTrack.onended " + track)
                    console.log(track)
                    this.stopMirror();
                };
            } else if (track.kind == 'audio') {
                this.audioTrack = track;
                track.onended = () => {
                    console.log("audioTrack.onended " + track)
                    console.log(track)
                };
            }

            console.log(track);
            console.log('track.getSettings() ');
            console.log(track.getSettings());
            console.log('track.getConstraints() ');
            console.log(track.getConstraints());
            console.log('track.getCapabilities() ');
            console.log(track.getCapabilities());
            track.onstarted = () => {
                console.log("track.onstarted " + track)
                console.log(track)
            };
            track.onmute = () => {
                console.log("track.onmute " + track)
                console.log(track)
            };
            track.onoverconstrained = () => {
                console.log("track.onoverconstrained " + track)
                console.log(track)
            };
            track.onunmute = () => {
                console.log("track.onunmute " + track)
                console.log(track)
            };
        }

        stream.onactive = () => { console.log("stream.onactive") };
        stream.oninactive = () => {
            console.log("stream.oninactive")
            this.stopMirror();
        };
    }

    startSilenceOscillator() {
        console.log("startSilenceOscillator ")
        const audioContext = this.audioContext;
        // 创建静音生成器
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.001; // 默认0.1%音量

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(0.001, audioContext.currentTime); // 频率0.001 Hz
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        try {
            oscillator.start();
            console.log("SilenceOscillator started")
        } catch (error) {
            console.error('Failed to start oscillator:', error);
        }
        return oscillator;
    }

    startRecord(stream, format) {
        // 'video/webm; codecs = h264,opus'
        let mimeType = 'video/' + format['video'];
        if (format['codec'] != null) {
            mimeType += '; codecs = ' + format['codec'];
        }
        console.log('startRecord: mimeType ' + mimeType);

        if (this.resolution == 1080) {
            // MT9655-50857: change *2.5 to *5
            this.videoBitsPerSecond = 1920 * 1080 * 5;
        } else if (this.resolution == 2160) {
            this.videoBitsPerSecond = 3840 * 2160 * 2.5;
        } else if (this.resolution == 720) {
            this.videoBitsPerSecond = 1280 * 720 * 5;
        } else {
            this.videoBitsPerSecond = 1920 * 1080 * 5;
        }
        console.log('startRecord: videoBitsPerSecond ' + this.videoBitsPerSecond);

        let options = {
            mimeType: mimeType,
            //audioBitsPerSecond : 6000,//128000,  // 音频码率
            videoBitsPerSecond: this.videoBitsPerSecond,
            ignoreMutedMedia: false,
        }
        console.log(options);

        // MT9653-105752: 后台生成静音音频，解决用户勾选声音但系统无声音输出时，MediaRecorder不触发ondataavailable的问题
        if (this.audioTrack) {
            console.log('User select audio, start a Oscillator');
            this.oscillator = this.startSilenceOscillator()
        }

        let mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorder.ondataavailable = (e) => {
            if (e && e.data && e.data.size > 0) {
                this.resetWatchdog();

                let slice = this.slice;
                if (slice == 0) {
                    this.sendRecordData(e.data);
                } else {
                    var pos = 0;
                    while (e.data.size > pos) {
                        var sendSize = e.data.size - pos > slice ? slice : e.data.size - pos;
                        var data = e.data.slice(pos, pos + sendSize)
                        this.sendRecordData(data);
                        pos += sendSize;
                    }
                }
            }
        };
        mediaRecorder.onerror = (e) => {
            console.error("handle record error: " + e);
        }
        console.log('startRecord: mediaRecorder start');
        mediaRecorder.start(1);

        return mediaRecorder;
    }

    async startMirrorAsync(ip, port) {
        console.log('startMirrorAsync ip: ' + ip + ', port: ' + port);
        this.state = WebMirrorState.CONNECTING;
        try {
            //建立指令通道
            await this.connectAndNegotiate(ip, port);
            this.state = WebMirrorState.CONNECTED;
        } catch (error) {
            console.error("connectSocket error: " + error);
            console.error(error);
            this.state = WebMirrorState.DISCONNECTED;
            this.callbackErrorAndStopMirror(error);
            return;
        }

        try {
            let stream = await this.requireMediaStream(this.resolution, this.frameRate);
            this.processMediaStream(stream);
        } catch (error) {
            console.error('startMirrorAsync: requireMediaStream ' + error)
            this.callbackErrorAndStopMirror(WebMirrorError.USER_REFUSED);
            return;
        }

        try {
            this.mediaRecorder = this.startRecord(this.stream, this.format);
        } catch (e) {
            console.error('startRecord: failed to create MediaRecorder: ', e);
            this.callbackErrorAndStopMirror(WebMirrorError.MEDIA_RECORDER_ERROR);
            return;
        }
        this.startWatchdog();
        this.startTimedLoopExecutor();

        this.callbackStart();
    }

    forceSetResolutionAndFrameRate(resolution, frameRate) {
        console.log("forceSetResolutionAndFrameRate: resolution: " + resolution + ", frameRate: " + frameRate);
        this.resolutionList = [resolution];
        this.resolution = resolution;
        this.frameRateList = [frameRate];
        this.frameRate = frameRate;
    }

    async mirrorAsyncAfterRequiredStream(ip, port) {
        console.log("mirrorAsyncAfterRequiredStream: ip: " + ip + ", port: " + port);
        try {
            await this.connectAndNegotiate(ip, port);
        } catch (e) {
            console.error("connectAndNegotiate error: " + error);
            this.state = WebMirrorState.DISCONNECTED;
            this.callbackErrorAndStopMirror(error);
            return;
        }

        try {
            this.mediaRecorder = this.startRecord(this.stream, this.format);
        } catch (e) {
            console.error('startRecord: failed to create MediaRecorder: ', e);
            this.callbackErrorAndStopMirror(WebMirrorError.MEDIA_RECORDER_ERROR);
            return;
        }
        this.startWatchdog();
        this.startTimedLoopExecutor();

        this.callbackStart();
    }

    startTimedLoopExecutor() {
        let upperLimit = 3000000;
        const videoBitsPerSecond = this.videoBitsPerSecond;
        if (videoBitsPerSecond) {
            //1080: 2592000
            //4K: 5184000
            upperLimit = videoBitsPerSecond / 4;
        }
        const lowerLimit = 1024; // 1K
        console.log(`startTimedLoopExecutor in, upper limit ${upperLimit}, lower limit ${lowerLimit}`);
        if (!this.timedLoopExecutor) {
            console.log('startTimedLoopExecutor, TimedLoopExecutor is null, new one');
            this.timedLoopExecutor = new TimedLoopExecutor(200, () => {
                const socket = this.socket;
                const mediaRecorder = this.mediaRecorder;

                if (!socket || !mediaRecorder) {
                    return;
                }

                const bufferedAmount = socket.bufferedAmount;
                const recorderState = mediaRecorder.state;

                // 如果缓冲区达到上限且当前正在录制，则暂停录制
                if (bufferedAmount > upperLimit && recorderState === 'recording') {
                    console.log(`Buffer size ${bufferedAmount} exceeds upper limit ${upperLimit}, pausing recording`);
                    mediaRecorder.pause();
                    this.sendFeedback(bufferedAmount, 'paused');
                }
                // 如果缓冲区降到下限以下且当前已暂停，则恢复录制
                else if (bufferedAmount < lowerLimit && recorderState === 'paused') {
                    console.log(`Buffer size ${bufferedAmount} below lower limit ${lowerLimit}, resuming recording`);
                    mediaRecorder.resume();
                    this.sendFeedback(bufferedAmount, 'recording');
                }

                if (Date.now() - this.lastFeedBackTime > 3000) {
                    this.sendFeedback(bufferedAmount, recorderState);
                }
            })
        }

        this.timedLoopExecutor.start();
    }

    startWatchdog() {
        console.log('startWatchdog in...');
        if (!this.watchdog) {
            console.log('startWatchdog, watchdog is null, new one');
            this.watchdog = new Watchdog();
        }
        this.watchdog.setup(45000, () => {
            console.log("Watchdog timeout!");
            this.stopMirror();
        });
        this.watchdog.start();
    }

    resetWatchdog() {
        //console.debug('resetWatchdog in...');
        if (this.watchdog) {
            this.watchdog.reset();
        } else {
            console.warn('resetWatchdog, watchdog is null');
        }
    }

    startMirror(ip, port) {
        if (this.state != WebMirrorState.DISCONNECTED) {
            console.error("error state when startMirror: " + this.state);
            return;
        }
        if (WebMirrorUtil.isRequireGetDisplayMediaFromGesture()) {
            this.forceSetResolutionAndFrameRate(1080, 30);
            this.requireMediaStream(this.resolution, this.frameRate).then(
                (stream) => {
                    this.processMediaStream(stream);
                    this.mirrorAsyncAfterRequiredStream(ip, port);
                }
            ).catch((error) => {
                console.error('startMirror: requireMediaStream ' + error)
                this.callbackErrorAndStopMirror(WebMirrorError.USER_REFUSED);
                return;
            });
        } else {
            this.startMirrorAsync(ip, port);
        }
    }

    stopRecord() {
        console.log('stopRecord in...');
        if (this.mediaRecorder) {
            console.log('do stopRecord');
            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.error('mediaRecorder stop exception: ', e.name);
            }
        }
        this.mediaRecorder = null;
    }

    stopSilenceOscillator() {
        console.log('stopSilenceOscillator in...');
        if (this.oscillator) {
            try {
                this.oscillator.stop();
                console.log("SilenceOscillator stoped")
            } catch (error) {
                console.error('Failed to stop oscillator:', error);
            }
        }

        this.oscillator = null;
    }

    stopStream() {
        console.log('stopStream in...');
        if (this.stream) {
            console.log('do stopStream');
            let tracks = this.stream.getTracks();
            tracks.forEach(track => track.stop());
        }
        this.stream = null;
        this.videoTrack = null;
        this.audioTrack = null;
    }

    stopWatchdog() {
        console.log('stopWatchdog in...');
        if (this.watchdog) {
            console.log('do stopWatchdog');
            this.watchdog.stop();
        }
        this.watchdog = null;
    }

    stopTimedLoopExecutor() {
        console.log('stopTimedLoopExecutor in...');
        if (this.timedLoopExecutor) {
            console.log('do stopTimedLoopExecutor');
            this.timedLoopExecutor.stop();
        }
        this.timedLoopExecutor = null;
    }

    closeSocket() {
        console.log('closeSocket in...');
        if (this.socket) {
            console.log('do closeSocket');
            this.socket.close();
        }
        this.socket = null;
    }

    clear() {
        console.log('clear in...');
        this.security = null;
        this.protocolVersion = null;
        this.resolution = null;
        this.frameRate = null;
        this.format = null;
        this.videoBitsPerSecond = null;
        this.totolSendTimes = 0;
        this.totolSendBytes = 0;
    }

    stopMirror() {
        console.log('stopMirror in...');
        this.stopTimedLoopExecutor();
        this.stopRecord();
        this.stopStream();
        this.stopSilenceOscillator();
        this.stopWatchdog();
        this.closeSocket();
        this.clear();
    }
}
