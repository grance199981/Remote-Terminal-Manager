import { app, BrowserWindow, clipboard, ipcMain, session, shell } from "electron";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "../shared/ipc.js";
import type {
  DeviceConnectionTestResult,
  DeviceDraft,
  LocalListRequest,
  LocalPathRequest,
  RemoteDesktopConfig,
  SftpListRequest,
  SftpPathRequest,
  SftpTransferRequest,
  TerminalCreateRequest,
  TerminalResizeRequest
} from "../shared/types.js";
import { deleteDevice, listDevices, saveDevice } from "./deviceStore.js";
import {
  deleteLocalFile,
  deleteRemote,
  downloadFile,
  listLocalFiles,
  listRemoteFiles,
  mkdirRemote,
  uploadFile
} from "./fileTransfer.js";
import {
  installRemoteDesktopDependencies,
  openRemoteDesktopClient,
  openRemoteDesktopTunnel,
  startRemoteDesktop,
  testRemoteDesktop
} from "./remoteDesktop.js";
import { TerminalManager } from "./terminalManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const terminalManager = new TerminalManager(() => mainWindow);

app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>;localhost;127.0.0.1;100.64.0.0/10;100.*");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: "#0b1020",
    title: "Remote Terminal Manager",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  void session.defaultSession.setProxy({
    proxyBypassRules: "<-loopback>;localhost;127.0.0.1;100.64.0.0/10;100.*"
  });
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  terminalManager.closeAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpc() {
  ipcMain.handle(IPC.DEVICES_LIST, () => listDevices());
  ipcMain.handle(IPC.DEVICES_SAVE, (_event, device: DeviceDraft) => saveDevice(device));
  ipcMain.handle(IPC.DEVICES_DELETE, (_event, id: string) => deleteDevice(id));
  ipcMain.handle(IPC.DEVICES_TEST, async (_event, id: string) => testDeviceConnection(id));
  ipcMain.handle(IPC.CLIPBOARD_READ, () => clipboard.readText());
  ipcMain.handle(IPC.CLIPBOARD_WRITE, (_event, text: string) => clipboard.writeText(text));

  ipcMain.handle(IPC.LOCAL_LIST, (_event, request: LocalListRequest) => listLocalFiles(request));
  ipcMain.handle(IPC.LOCAL_DELETE, (_event, request: LocalPathRequest) => deleteLocalFile(request));
  ipcMain.handle(IPC.SFTP_LIST, async (_event, request: SftpListRequest) => {
    const device = await requireSshDevice(request.deviceId);
    return listRemoteFiles(device, request);
  });
  ipcMain.handle(IPC.SFTP_UPLOAD, async (event, request: SftpTransferRequest) => {
    const device = await requireSshDevice(request.deviceId);
    return uploadFile(device, request, (progress) => {
      event.sender.send(IPC.SFTP_PROGRESS, { deviceId: device.id, ...progress });
    });
  });
  ipcMain.handle(IPC.SFTP_DOWNLOAD, async (_event, request: SftpTransferRequest) => {
    const device = await requireSshDevice(request.deviceId);
    return downloadFile(device, request);
  });
  ipcMain.handle(IPC.SFTP_MKDIR, async (_event, request: SftpPathRequest) => {
    const device = await requireSshDevice(request.deviceId);
    return mkdirRemote(device, request);
  });
  ipcMain.handle(IPC.SFTP_DELETE, async (_event, request: SftpPathRequest) => {
    const device = await requireSshDevice(request.deviceId);
    return deleteRemote(device, request);
  });

  ipcMain.handle(IPC.DESKTOP_TEST, async (_event, request: RemoteDesktopConfig) => {
    const device = await requireSshDevice(request.deviceId);
    return testRemoteDesktop(device, request);
  });
  ipcMain.handle(IPC.DESKTOP_START, async (_event, request: RemoteDesktopConfig) => {
    const device = await requireSshDevice(request.deviceId);
    return startRemoteDesktop(device, request);
  });
  ipcMain.handle(IPC.DESKTOP_INSTALL, async (_event, request: RemoteDesktopConfig) => {
    const device = await requireSshDevice(request.deviceId);
    return installRemoteDesktopDependencies(device, request);
  });
  ipcMain.handle(IPC.DESKTOP_TUNNEL, async (_event, request: RemoteDesktopConfig) => {
    const device = await requireSshDevice(request.deviceId);
    return openRemoteDesktopTunnel(device, request);
  });
  ipcMain.handle(IPC.DESKTOP_OPEN_CLIENT, async (_event, request: RemoteDesktopConfig) => {
    const device = await requireSshDevice(request.deviceId);
    try {
      return await openRemoteDesktopClient(device, request);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle(IPC.TERMINAL_CREATE, async (_event, request: TerminalCreateRequest) => {
    const device = request.deviceId
      ? (await listDevices()).find((item) => item.id === request.deviceId)
      : undefined;
    return terminalManager.create(request, device);
  });

  ipcMain.on(IPC.TERMINAL_INPUT, (_event, payload: { id: string; data: string }) => {
    terminalManager.write(payload.id, payload.data);
  });

  ipcMain.on(IPC.TERMINAL_RESIZE, (_event, request: TerminalResizeRequest) => {
    terminalManager.resize(request);
  });

  ipcMain.on(IPC.TERMINAL_CLOSE, (_event, payload: { id: string }) => {
    terminalManager.close(payload.id);
  });
}

async function testDeviceConnection(id: string): Promise<DeviceConnectionTestResult> {
  const device = (await listDevices()).find((item) => item.id === id);
  if (!device || device.type !== "ssh" || !device.host) {
    throw new Error("Device is not a valid SSH target");
  }

  const host = device.host;
  const port = device.port ?? 22;
  const started = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, host, port, elapsedMs: Date.now() - started, message });
    };

    socket.setTimeout(8000);
    socket.once("connect", () => finish(true, `TCP ${host}:${port} reachable`));
    socket.once("timeout", () => finish(false, `TCP ${host}:${port} timeout after 8000ms`));
    socket.once("error", (error) => finish(false, error.message));
  });
}


async function requireSshDevice(id: string) {
  const device = (await listDevices()).find((item) => item.id === id);
  if (!device || device.type !== "ssh" || !device.host) {
    throw new Error("Device is not a valid SSH target");
  }
  return device;
}
