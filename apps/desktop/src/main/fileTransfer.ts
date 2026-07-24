import { Client } from "ssh2";
import type { SFTPWrapper, Stats } from "ssh2";
import { mkdir, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import posixPath from "node:path/posix";
import type {
  Device,
  FileEntry,
  FileListResponse,
  LocalListRequest,
  OperationResult,
  SftpAuthRequest,
  SftpListRequest,
  SftpPathRequest,
  SftpTransferRequest
} from "../shared/types.js";

export async function listLocalFiles(request: LocalListRequest): Promise<FileListResponse> {
  const requestedPath = request.path?.trim() || os.homedir();
  const resolvedPath = path.resolve(requestedPath);
  const items = await readdir(resolvedPath, { withFileTypes: true });
  const entries = await Promise.all(
    items.map(async (item): Promise<FileEntry> => {
      const fullPath = path.join(resolvedPath, item.name);
      const itemStat = await stat(fullPath).catch(() => undefined);
      return {
        name: item.name,
        path: fullPath,
        type: item.isDirectory() ? "directory" : item.isFile() ? "file" : "other",
        size: itemStat?.size ?? 0,
        modifiedAt: itemStat?.mtimeMs
      };
    })
  );

  return {
    path: resolvedPath,
    parent: path.dirname(resolvedPath),
    roots: await listLocalRoots(),
    entries: sortEntries(entries)
  };
}

export async function listRemoteFiles(device: Device, request: SftpListRequest): Promise<FileListResponse> {
  return withSftp(device, request, async (sftp) => {
    const remotePath = normalizeRemotePath(request.path || defaultRemotePath(device));
    const items = await sftpReaddir(sftp, remotePath);
    const entries = items.map((item): FileEntry => {
      const type = statType(item.attrs);
      return {
        name: item.filename,
        path: posixPath.join(remotePath, item.filename),
        type,
        size: item.attrs.size ?? 0,
        modifiedAt: item.attrs.mtime ? item.attrs.mtime * 1000 : undefined
      };
    });

    return {
      path: remotePath,
      parent: remotePath === "/" || remotePath === "." ? undefined : posixPath.dirname(remotePath),
      entries: sortEntries(entries)
    };
  });
}

export async function uploadFile(device: Device, request: SftpTransferRequest): Promise<OperationResult> {
  return withSftp(device, request, async (sftp) => {
    const localStats = await stat(request.localPath);
    const remotePath = normalizeRemotePath(request.remotePath);
    if (!request.overwrite && await remotePathExists(sftp, remotePath)) {
      return { ok: false, conflict: true, message: `Remote target already exists: ${remotePath}` };
    }
    let count = 0;
    if (localStats.isDirectory()) {
      count = await uploadDirectory(sftp, request.localPath, remotePath);
      return { ok: true, message: `Upload completed: ${remotePath} (${count} files)` };
    }
    await ensureRemoteDir(sftp, posixPath.dirname(remotePath));
    await sftpFastPut(sftp, request.localPath, remotePath);
    return { ok: true, message: `Upload completed: ${remotePath}` };
  });
}

export async function downloadFile(device: Device, request: SftpTransferRequest): Promise<OperationResult> {
  return withSftp(device, request, async (sftp) => {
    const remotePath = normalizeRemotePath(request.remotePath);
    if (!request.overwrite && await localPathExists(request.localPath)) {
      return { ok: false, conflict: true, message: `Local target already exists: ${request.localPath}` };
    }
    const attrs = await sftpLstat(sftp, remotePath);
    let count = 0;
    if (statType(attrs) === "directory") {
      count = await downloadDirectory(sftp, remotePath, request.localPath);
      return { ok: true, message: `Download completed: ${request.localPath} (${count} files)` };
    }
    await mkdir(path.dirname(request.localPath), { recursive: true });
    await sftpFastGet(sftp, remotePath, request.localPath);
    return { ok: true, message: `Download completed: ${request.localPath}` };
  });
}

export async function mkdirRemote(device: Device, request: SftpPathRequest): Promise<OperationResult> {
  return withSftp(device, request, async (sftp) => {
    await sftpMkdir(sftp, normalizeRemotePath(request.path));
    return { ok: true, message: "Remote directory created" };
  });
}

export async function deleteRemote(device: Device, request: SftpPathRequest): Promise<OperationResult> {
  return withSftp(device, request, async (sftp) => {
    const remotePath = normalizeRemotePath(request.path);
    const attrs = await sftpLstat(sftp, remotePath);
    if (statType(attrs) === "directory") {
      await sftpRmdir(sftp, remotePath);
    } else {
      await sftpUnlink(sftp, remotePath);
    }
    return { ok: true, message: "Remote item deleted" };
  });
}

function defaultRemotePath(_device: Device): string {
  // An SFTP account may be chrooted or use a nonstandard home directory. The
  // only portable initial location is its current SFTP directory (".").
  return ".";
}

function normalizeRemotePath(value: string): string {
  // Keep relative paths relative: forcing a leading slash breaks chrooted and
  // restricted SFTP servers, where only "." and its descendants are valid.
  return posixPath.normalize(value.trim() || ".");
}

async function withSftp<T>(
  device: Device,
  request: SftpAuthRequest,
  callback: (sftp: SFTPWrapper) => Promise<T>
): Promise<T> {
  const conn = new Client();
  const config = {
    host: device.host,
    port: device.port ?? 22,
    username: device.username,
    password: device.authType === "password" ? request.password : undefined,
    privateKey:
      device.authType === "privateKey" && device.privateKeyPath
        ? readFileSync(device.privateKeyPath)
        : undefined,
    readyTimeout: 20000,
    keepaliveInterval: 15000
  };

  const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
    conn
      .on("ready", () => {
        conn.sftp((error, wrapper) => {
          if (error) reject(error);
          else resolve(wrapper);
        });
      })
      .on("error", reject)
      .connect(config);
  });

  try {
    return await callback(sftp);
  } finally {
    sftp.end();
    conn.end();
  }
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

async function listLocalRoots(): Promise<string[] | undefined> {
  if (process.platform !== "win32") return ["/"];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const existing = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      try {
        await stat(root);
        return root;
      } catch {
        return undefined;
      }
    })
  );
  return existing.filter((root): root is string => Boolean(root));
}

function statType(attrs: Stats): FileEntry["type"] {
  if (attrs.isDirectory()) return "directory";
  if (attrs.isFile()) return "file";
  return "other";
}

async function remotePathExists(sftp: SFTPWrapper, remotePath: string): Promise<boolean> {
  try {
    await sftpLstat(sftp, remotePath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

async function localPathExists(localPath: string): Promise<boolean> {
  try {
    await stat(localPath);
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOENT") return false;
    throw error;
  }
}

async function uploadDirectory(sftp: SFTPWrapper, localDir: string, remoteDir: string): Promise<number> {
  await ensureRemoteDir(sftp, remoteDir);
  const items = await readdir(localDir, { withFileTypes: true });
  let count = 0;
  for (const item of items) {
    const localChild = path.join(localDir, item.name);
    const remoteChild = posixPath.join(remoteDir, item.name);
    if (item.isDirectory()) {
      count += await uploadDirectory(sftp, localChild, remoteChild);
    } else if (item.isFile()) {
      await sftpFastPut(sftp, localChild, remoteChild).catch((error) => {
        throw new Error(`Upload failed: ${localChild} -> ${remoteChild}: ${getErrorMessage(error)}`);
      });
      count += 1;
    }
  }
  return count;
}

async function downloadDirectory(sftp: SFTPWrapper, remoteDir: string, localDir: string): Promise<number> {
  await mkdir(localDir, { recursive: true });
  const items = await sftpReaddir(sftp, remoteDir);
  let count = 0;
  for (const item of items) {
    if (item.filename === "." || item.filename === "..") continue;
    const remoteChild = posixPath.join(remoteDir, item.filename);
    const localChild = path.join(localDir, item.filename);
    const type = statType(item.attrs);
    if (type === "directory") {
      count += await downloadDirectory(sftp, remoteChild, localChild);
    } else if (type === "file") {
      await mkdir(path.dirname(localChild), { recursive: true });
      await sftpFastGet(sftp, remoteChild, localChild);
      count += 1;
    }
  }
  return count;
}

async function ensureRemoteDir(sftp: SFTPWrapper, remoteDir: string): Promise<void> {
  const normalized = normalizeRemotePath(remoteDir);
  if (normalized === "/" || normalized === ".") return;
  const absolute = normalized.startsWith("/");
  const parts = normalized.split("/").filter((part) => Boolean(part) && part !== ".");
  let current = absolute ? "/" : "";
  for (const part of parts) {
    current = current ? posixPath.join(current, part) : part;
    try {
      const attrs = await sftpLstat(sftp, current);
      if (statType(attrs) !== "directory") throw new Error(`Remote path exists and is not a directory: ${current}`);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      await sftpMkdir(sftp, current).catch((mkdirError) => {
        if (!isAlreadyExistsError(mkdirError)) {
          throw new Error(`Create remote directory failed: ${current}: ${getErrorMessage(mkdirError)}`);
        }
      });
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  const typed = error as { code?: unknown };
  const code = typed.code;
  const message = getErrorMessage(error).toLowerCase();
  return code === "ENOENT" || code === "2" || code === 2 || message.includes("no such file");
}

function isAlreadyExistsError(error: unknown): boolean {
  const typed = error as { code?: unknown };
  const code = typed.code;
  const message = getErrorMessage(error).toLowerCase();
  return code === "EEXIST" || code === "4" || code === 4 || message.includes("failure") || message.includes("file exists");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sftpReaddir(sftp: SFTPWrapper, target: string) {
  return new Promise<Array<{ filename: string; longname: string; attrs: Stats }>>((resolve, reject) => {
    sftp.readdir(target, (error, list) => (error ? reject(error) : resolve(list)));
  });
}

function sftpFastPut(sftp: SFTPWrapper, localPath: string, remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    // A small concurrency is more reliable with restrictive SFTP servers than
    // ssh2's default of 64 concurrent write requests.
    const idleTimeoutMs = 60_000;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const armIdleTimeout = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        finish(new Error(`SFTP upload stalled for 60 seconds: ${localPath} -> ${remotePath}`));
      }, idleTimeoutMs);
    };

    armIdleTimeout();
    sftp.fastPut(
      localPath,
      remotePath,
      {
        concurrency: 4,
        chunkSize: 32 * 1024,
        step: () => armIdleTimeout()
      },
      (error) => finish(error ?? undefined)
    );
  });
}

function sftpFastGet(sftp: SFTPWrapper, remotePath: string, localPath: string) {
  return new Promise<void>((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, (error) => (error ? reject(error) : resolve()));
  });
}

function sftpMkdir(sftp: SFTPWrapper, remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    sftp.mkdir(remotePath, (error) => (error ? reject(error) : resolve()));
  });
}

function sftpLstat(sftp: SFTPWrapper, remotePath: string) {
  return new Promise<Stats>((resolve, reject) => {
    sftp.lstat(remotePath, (error, stats) => (error ? reject(error) : resolve(stats)));
  });
}

function sftpRmdir(sftp: SFTPWrapper, remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    sftp.rmdir(remotePath, (error) => (error ? reject(error) : resolve()));
  });
}

function sftpUnlink(sftp: SFTPWrapper, remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    sftp.unlink(remotePath, (error) => (error ? reject(error) : resolve()));
  });
}
