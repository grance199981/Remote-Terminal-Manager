# Remote Terminal Manager

Remote Terminal Manager 是一个自用的 Windows 桌面工具，用于管理已授权服务器的远程访问能力。

## 主要功能

- SSH 远程终端
- 本机 PowerShell / CMD 终端
- SFTP 文件上传与下载
- 基于 Tailscale IP + VNC/noVNC 的 Ubuntu GUI 远程桌面

> 本项目只用于连接自己拥有或已获得明确授权的设备，不用于未授权访问、隐藏控制或绕过商业软件授权。

## 快速使用

1. 确保 Windows 本机和 Ubuntu 服务器都登录同一个 Tailscale Tailnet。
2. 在 Tailscale 管理页面确认两台设备都显示为 Connected。
3. 在软件中新增设备，Host 填写服务器的 Tailscale IP，例如 `100.x.y.z`。
4. 端口填写 `22`，用户名填写 Ubuntu 用户名。
5. 点击“连接 SSH”打开远程终端。
6. 点击“文件传输”使用 SFTP 上传或下载文件。
7. 点击“远程桌面”打开 Ubuntu GUI 远程画面。

## Ubuntu 服务器依赖

如果只使用 SSH/SFTP，服务器需要：

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
```

如果还要使用远程桌面，服务器还需要：

```bash
sudo apt update
sudo apt install -y \
  xfce4 xfce4-goodies \
  tigervnc-standalone-server tigervnc-common \
  novnc websockify \
  dbus-x11 xterm iproute2
```

如果当前用户没有 sudo 权限，请让服务器管理员安装上述依赖。

## 当前便携版 exe

```text
apps/desktop/release/Remote-Terminal-Manager-0.1.0-portable-x64-native-scale.exe
```

> 注意：`release/` 目录中的 exe 属于构建产物，默认不上传 GitHub。建议在 GitHub Releases 页面单独发布 exe。

## 完整使用说明

请打开：

```text
docs/USER_GUIDE_ZH.html
```

该文档包含：

- Tailscale 注册与连接
- Windows 本机与 Ubuntu 服务器接入同一 VPN
- Ubuntu 服务器依赖安装
- SSH、SFTP、远程桌面使用流程
- 给 Codex/Agent 做远程实验的建议
- 常见问题排查
- 安全建议

## 开发运行

```powershell
cmd /c npm.cmd install --cache .npm-cache
cmd /c npm.cmd run dev
```

## 构建

```powershell
cmd /c npm.cmd run build
```

## 打包 Windows 便携版

```powershell
cmd /c npm.cmd run package:win
```

## 建议上传到 GitHub 的内容

应该上传：

- `README.md`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `apps/desktop/package.json`
- `apps/desktop/src/**`
- `apps/desktop/scripts/**`
- `apps/desktop/index.html`
- `apps/desktop/tsconfig.json`
- `apps/desktop/tsconfig.main.json`
- `apps/desktop/vite.config.ts`
- `docs/**`

不建议上传：

- `node_modules/`
- `.npm-cache/`
- `apps/desktop/dist/`
- `apps/desktop/release/`
- `apps/desktop/node_modules/`
- `.env`、私钥、密码文件、本地设备配置文件
- 各类日志文件和系统临时文件

## 首次推送到 GitHub

在 GitHub 新建空仓库后，在本地执行：

```powershell
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

之后可以直接使用界面里的“推送”，或者执行：

```powershell
git push
```
