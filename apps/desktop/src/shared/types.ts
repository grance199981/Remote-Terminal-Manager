export type DeviceType = "ssh" | "local";
export type AuthType = "password" | "privateKey";
export type LocalShell = "powershell" | "cmd";

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  host?: string;
  port?: number;
  username?: string;
  authType?: AuthType;
  privateKeyPath?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeviceDraft {
  id?: string;
  name: string;
  type: DeviceType;
  host?: string;
  port?: number;
  username?: string;
  authType?: AuthType;
  privateKeyPath?: string;
  tags?: string[];
}

export interface DeviceConnectionTestResult {
  ok: boolean;
  host: string;
  port: number;
  elapsedMs: number;
  message: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "other";
  size: number;
  modifiedAt?: number;
}

export interface LocalListRequest {
  path?: string;
}

export interface FileListResponse {
  path: string;
  parent?: string;
  roots?: string[];
  entries: FileEntry[];
}

export interface SftpAuthRequest {
  deviceId: string;
  password?: string;
}

export interface SftpListRequest extends SftpAuthRequest {
  path: string;
}

export interface SftpTransferRequest extends SftpAuthRequest {
  localPath: string;
  remotePath: string;
}

export interface SftpPathRequest extends SftpAuthRequest {
  path: string;
}

export interface OperationResult {
  ok: boolean;
  message: string;
}

export interface RemoteDesktopConfig {
  deviceId: string;
  password?: string;
  noVncPort: number;
  vncDisplay: number;
  width: number;
  height: number;
  depth: number;
}

export interface RemoteDesktopStatus {
  ok: boolean;
  host: string;
  port: number;
  url: string;
  message: string;
  elapsedMs: number;
}

export interface RemoteDesktopStartResult extends RemoteDesktopStatus {
  output: string;
}

export interface TerminalCreateRequest {
  kind: DeviceType;
  deviceId?: string;
  shell?: LocalShell;
  password?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalCreateResponse {
  id: string;
  title: string;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  code?: number;
  signal?: number | string;
  message?: string;
}

export interface TerminalResizeRequest {
  id: string;
  cols: number;
  rows: number;
}
