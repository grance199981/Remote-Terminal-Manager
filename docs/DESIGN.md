# 设计概要

## 模块

```text
Electron Main
  ├─ deviceStore.ts       本地设备配置 JSON 存储
  ├─ terminalManager.ts   node-pty / ssh2 会话管理
  └─ main.ts              窗口与 IPC

Preload
  └─ preload.ts           安全暴露 remoteTerminal API

Renderer
  ├─ App.tsx              应用壳、设备列表、动作入口
  ├─ DeviceEditor.tsx     设备编辑弹窗
  └─ TerminalPane.tsx     xterm.js 多标签终端
```

## IPC API

- `devices:list`
- `devices:save`
- `devices:delete`
- `terminal:create`
- `terminal:input`
- `terminal:resize`
- `terminal:close`
- `terminal:data`
- `terminal:exit`
- `terminal:error`

## 存储

设备配置保存在 Electron `app.getPath("userData")/devices.json`。

密码不保存；私钥方式只保存本地路径。
