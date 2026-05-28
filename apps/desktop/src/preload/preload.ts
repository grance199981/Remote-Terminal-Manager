import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc.js";
import type {
  DeviceDraft,
  LocalListRequest,
  RemoteDesktopConfig,
  SftpListRequest,
  SftpPathRequest,
  SftpTransferRequest,
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalResizeRequest
} from "../shared/types.js";

contextBridge.exposeInMainWorld("remoteTerminal", {
  devices: {
    list: () => ipcRenderer.invoke(IPC.DEVICES_LIST),
    save: (device: DeviceDraft) => ipcRenderer.invoke(IPC.DEVICES_SAVE, device),
    delete: (id: string) => ipcRenderer.invoke(IPC.DEVICES_DELETE, id),
    test: (id: string) => ipcRenderer.invoke(IPC.DEVICES_TEST, id)
  },
  files: {
    listLocal: (request: LocalListRequest) => ipcRenderer.invoke(IPC.LOCAL_LIST, request),
    listRemote: (request: SftpListRequest) => ipcRenderer.invoke(IPC.SFTP_LIST, request),
    upload: (request: SftpTransferRequest) => ipcRenderer.invoke(IPC.SFTP_UPLOAD, request),
    download: (request: SftpTransferRequest) => ipcRenderer.invoke(IPC.SFTP_DOWNLOAD, request),
    mkdir: (request: SftpPathRequest) => ipcRenderer.invoke(IPC.SFTP_MKDIR, request),
    deleteRemote: (request: SftpPathRequest) => ipcRenderer.invoke(IPC.SFTP_DELETE, request)
  },
  desktop: {
    test: (request: RemoteDesktopConfig) => ipcRenderer.invoke(IPC.DESKTOP_TEST, request),
    start: (request: RemoteDesktopConfig) => ipcRenderer.invoke(IPC.DESKTOP_START, request),
    install: (request: RemoteDesktopConfig) => ipcRenderer.invoke(IPC.DESKTOP_INSTALL, request),
    tunnel: (request: RemoteDesktopConfig) => ipcRenderer.invoke(IPC.DESKTOP_TUNNEL, request),
    openClient: (request: RemoteDesktopConfig) => ipcRenderer.invoke(IPC.DESKTOP_OPEN_CLIENT, request)
  },
  terminals: {
    create: (request: TerminalCreateRequest) => ipcRenderer.invoke(IPC.TERMINAL_CREATE, request),
    input: (id: string, data: string) => ipcRenderer.send(IPC.TERMINAL_INPUT, { id, data }),
    resize: (request: TerminalResizeRequest) => ipcRenderer.send(IPC.TERMINAL_RESIZE, request),
    close: (id: string) => ipcRenderer.send(IPC.TERMINAL_CLOSE, { id }),
    onData: (callback: (event: TerminalDataEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalDataEvent) => callback(event);
      ipcRenderer.on(IPC.TERMINAL_DATA, handler);
      return () => ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler);
    },
    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalExitEvent) => callback(event);
      ipcRenderer.on(IPC.TERMINAL_EXIT, handler);
      return () => ipcRenderer.removeListener(IPC.TERMINAL_EXIT, handler);
    },
    onError: (callback: (event: TerminalExitEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalExitEvent) => callback(event);
      ipcRenderer.on(IPC.TERMINAL_ERROR, handler);
      return () => ipcRenderer.removeListener(IPC.TERMINAL_ERROR, handler);
    }
  }
});
