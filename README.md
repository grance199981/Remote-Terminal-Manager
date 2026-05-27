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

## 下载使用

普通用户不需要安装 Node.js，也不需要自己构建项目。请在 GitHub Releases 下载最新版 Windows 便携版 exe：

```text
https://github.com/grance199981/Remote-Terminal-Manager/releases/latest
```

下载 `Remote-Terminal-Manager-*.exe` 后双击运行即可。

> 说明：`apps/desktop/release/` 中的 exe 是本地构建产物，默认不提交到 Git 仓库。正式分发时请把 exe 上传到 GitHub Releases，README 中提供 Releases 下载入口。

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

打包后，本地 exe 会出现在：

```text
apps/desktop/release/
```

该目录已被 `.gitignore` 排除，不会进入 Git 历史。发布新版时，请把生成的 exe 上传到 GitHub Releases。

## 发布 exe 到 GitHub Releases

首次推送源码到 GitHub 后，可以在 GitHub 网页端发布 exe：

1. 打开仓库页面。
2. 点击右侧或顶部的 `Releases`。
3. 点击 `Draft a new release`。
4. 新建 tag，例如 `v0.1.0`。
5. 标题填写 `Remote Terminal Manager v0.1.0`。
6. 上传本地生成的 exe，例如：

```text
apps/desktop/release/Remote-Terminal-Manager-0.1.0-portable-x64-native-scale.exe
```

7. 点击 `Publish release`。

之后用户就可以通过 `releases/latest` 下载图形界面软件。

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
git remote add origin https://github.com/grance199981/Remote-Terminal-Manager.git
git branch -M main
git push -u origin main
```

之后可以直接使用界面里的“推送”，或者执行：

```powershell
git push
```
