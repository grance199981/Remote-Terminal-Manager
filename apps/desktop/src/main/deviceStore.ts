import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Device, DeviceDraft } from "../shared/types.js";

const STORE_FILE = "devices.json";

function storePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

function sanitizeDevice(device: Device): Device {
  return {
    ...device,
    port: device.type === "ssh" ? Number(device.port ?? 22) : undefined,
    host: device.type === "ssh" ? device.host?.trim() : undefined,
    username: device.type === "ssh" ? device.username?.trim() : undefined,
    authType: device.type === "ssh" ? device.authType ?? "password" : undefined,
    privateKeyPath:
      device.type === "ssh" && device.authType === "privateKey"
        ? device.privateKeyPath?.trim()
        : undefined,
    tags: device.tags?.map((tag) => tag.trim()).filter(Boolean) ?? []
  };
}

async function ensureStoreDir() {
  await mkdir(path.dirname(storePath()), { recursive: true });
}

export async function listDevices(): Promise<Device[]> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Device[];
    return Array.isArray(parsed) ? parsed.map(sanitizeDevice) : [];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeDevices(devices: Device[]) {
  await ensureStoreDir();
  await writeFile(storePath(), JSON.stringify(devices.map(sanitizeDevice), null, 2), "utf8");
}

export async function saveDevice(draft: DeviceDraft): Promise<Device> {
  const now = new Date().toISOString();
  const devices = await listDevices();
  const existing = draft.id ? devices.find((device) => device.id === draft.id) : undefined;

  const next: Device = sanitizeDevice({
    id: draft.id ?? randomUUID(),
    name: draft.name.trim(),
    type: draft.type,
    host: draft.host,
    port: draft.port,
    username: draft.username,
    authType: draft.authType,
    privateKeyPath: draft.privateKeyPath,
    tags: draft.tags,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });

  validateDevice(next);

  const updated = existing
    ? devices.map((device) => (device.id === next.id ? next : device))
    : [...devices, next];
  await writeDevices(updated);
  return next;
}

export async function deleteDevice(id: string): Promise<void> {
  const devices = await listDevices();
  await writeDevices(devices.filter((device) => device.id !== id));
}

export function validateDevice(device: Device): void {
  if (!device.name) throw new Error("设备名称不能为空");
  if (device.type === "ssh") {
    if (!device.host) throw new Error("SSH 主机地址不能为空");
    if (!device.username) throw new Error("SSH 用户名不能为空");
    if (!device.port || device.port <= 0 || device.port > 65535) {
      throw new Error("SSH 端口必须在 1-65535 之间");
    }
    if (device.authType === "privateKey" && !device.privateKeyPath) {
      throw new Error("私钥登录需要填写私钥路径");
    }
  }
}
