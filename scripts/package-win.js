const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('此脚本只打包 Windows x64');
}

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const output = path.resolve(dist, 'HisenseAutoCast-win32-x64');
if (path.dirname(output) !== dist) throw new Error('打包目录不在 dist 中');

const electronExe = require('electron');
if (!fs.existsSync(electronExe)) throw new Error('Electron 运行文件未安装');
const configOutput = path.join(output, 'config', 'config.json');
const previousConfig = fs.existsSync(configOutput)
  ? JSON.parse(fs.readFileSync(configOutput, 'utf8')) : {};
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.dirname(electronExe), output, { recursive: true });
fs.renameSync(path.join(output, 'electron.exe'), path.join(output, 'HisenseAutoCast.exe'));

const appDir = path.join(output, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(appDir, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'package.json'), path.join(appDir, 'package.json'));
fs.mkdirSync(path.join(output, 'config'));
const defaultConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'config.json'), 'utf8'));
fs.writeFileSync(configOutput, `${JSON.stringify({ ...defaultConfig, ...previousConfig }, null, 2)}\n`);
fs.copyFileSync(path.join(root, 'README.md'), path.join(output, 'README.md'));
console.log(`打包完成：${path.join(output, 'HisenseAutoCast.exe')}`);
