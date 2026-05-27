import { BrowserWindow } from "electron";
import { Client } from "ssh2";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { IPC } from "../shared/ipc.js";
import type {
  Device,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalExitEvent,
  TerminalResizeRequest
} from "../shared/types.js";

type PtyProcess = import("node-pty").IPty;
type SshStream = import("ssh2").ClientChannel;
type NodePtyModule = typeof import("node-pty");

const require = createRequire(import.meta.url);

interface LocalSession {
  id: string;
  kind: "local";
  pty: PtyProcess;
}

interface SshSession {
  id: string;
  kind: "ssh";
  conn: Client;
  stream?: SshStream;
}

type Session = LocalSession | SshSession;

export class TerminalManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  async create(request: TerminalCreateRequest, device?: Device): Promise<TerminalCreateResponse> {
    if (request.kind === "local") {
      return this.createLocal(request);
    }
    if (!device) throw new Error("未找到 SSH 设备配置");
    return this.createSsh(request, device);
  }

  write(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.kind === "local") session.pty.write(data);
    else session.stream?.write(data);
  }

  resize(request: TerminalResizeRequest) {
    const session = this.sessions.get(request.id);
    if (!session) return;
    if (session.kind === "local") {
      session.pty.resize(request.cols, request.rows);
    } else if (session.stream) {
      session.stream.setWindow(request.rows, request.cols, 0, 0);
    }
  }

  close(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.kind === "local") {
      session.pty.kill();
    } else {
      session.stream?.end();
      session.conn.end();
    }
    this.sessions.delete(id);
  }

  closeAll() {
    for (const id of this.sessions.keys()) {
      this.close(id);
    }
  }

  private async createLocal(request: TerminalCreateRequest): Promise<TerminalCreateResponse> {
    const pty = await loadNodePty();
    const id = randomUUID();
    const shell = request.shell ?? "powershell";
    const shellPath =
      shell === "cmd"
        ? "cmd.exe"
        : process.env.ComSpec && os.platform() === "win32"
          ? "powershell.exe"
          : process.env.SHELL ?? "bash";

    const proc = pty.spawn(shellPath, [], {
      name: "xterm-256color",
      cols: request.cols ?? 100,
      rows: request.rows ?? 30,
      cwd: os.homedir(),
      env: process.env
    });

    this.sessions.set(id, { id, kind: "local", pty: proc });
    proc.onData((data) => this.send(IPC.TERMINAL_DATA, { id, data }));
    proc.onExit(({ exitCode, signal }) => {
      this.sessions.delete(id);
      this.send(IPC.TERMINAL_EXIT, { id, code: exitCode, signal });
    });

    return { id, title: shell === "cmd" ? "CMD" : "PowerShell" };
  }

  private async createSsh(
    request: TerminalCreateRequest,
    device: Device
  ): Promise<TerminalCreateResponse> {
    const id = randomUUID();
    const conn = new Client();
    const session: SshSession = { id, kind: "ssh", conn };
    this.sessions.set(id, session);

    const config = {
      host: device.host,
      port: device.port ?? 22,
      username: device.username,
      password: device.authType === "password" ? request.password : undefined,
      privateKey:
        device.authType === "privateKey" && device.privateKeyPath
          ? readFileSync(device.privateKeyPath)
          : undefined,
      keepaliveInterval: 15000,
      readyTimeout: 20000
    };

    await new Promise<void>((resolve, reject) => {
      conn
        .on("ready", () => {
          conn.shell(
            {
              term: "xterm-256color",
              cols: request.cols ?? 100,
              rows: request.rows ?? 30
            },
            (error, stream) => {
              if (error) {
                this.sessions.delete(id);
                reject(error);
                return;
              }
              session.stream = stream;
              stream.on("data", (data: Buffer) => {
                this.send(IPC.TERMINAL_DATA, { id, data: data.toString("utf8") });
              });
              stream.stderr.on("data", (data: Buffer) => {
                this.send(IPC.TERMINAL_DATA, { id, data: data.toString("utf8") });
              });
              stream.on("close", () => {
                this.sessions.delete(id);
                conn.end();
                this.send(IPC.TERMINAL_EXIT, { id, message: "SSH shell closed" });
              });
              resolve();
            }
          );
        })
        .on("error", (error) => {
          this.sessions.delete(id);
          const event: TerminalExitEvent = { id, message: error.message };
          this.send(IPC.TERMINAL_ERROR, event);
          reject(error);
        })
        .on("close", () => {
          if (this.sessions.has(id)) {
            this.sessions.delete(id);
            this.send(IPC.TERMINAL_EXIT, { id, message: "SSH connection closed" });
          }
        })
        .connect(config);
    });

    return { id, title: `${device.name}` };
  }

  private send(channel: string, payload: unknown) {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

async function loadNodePty(): Promise<NodePtyModule> {
  const packagedPath = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "node-pty");
  if (existsSync(packagedPath)) {
    return require(packagedPath) as NodePtyModule;
  }

  try {
    return require("node-pty") as NodePtyModule;
  } catch {
    return import("node-pty");
  }
}
