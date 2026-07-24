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

export interface LocalPathRequest {
  path: string;
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
  /** Explicit consent is required before replacing an existing target. */
  overwrite?: boolean;
}

export interface SftpPathRequest extends SftpAuthRequest {
  path: string;
}

export interface SftpProgressEvent {
  deviceId: string;
  direction: "upload";
  path: string;
  completedFiles: number;
  transferredBytes: number;
  totalBytes: number;
}

export interface OperationResult {
  ok: boolean;
  message: string;
  conflict?: boolean;
}

export type RemoteDesktopBackend = "novnc" | "xrdp" | "rustdesk" | "moonlight";

export interface RemoteDesktopConfig {
  deviceId: string;
  backend?: RemoteDesktopBackend;
  password?: string;
  noVncPort: number;
  vncDisplay: number;
  width: number;
  height: number;
  depth: number;
  rdpPort?: number;
  rustDeskId?: string;
  rustDeskPath?: string;
  moonlightPath?: string;
  moonlightApp?: string;
  moonlightFps?: number;
  moonlightBitrateKbps?: number;
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
