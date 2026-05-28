import { Client } from "ssh2";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import type {
  Device,
  OperationResult,
  RemoteDesktopConfig,
  RemoteDesktopStartResult,
  RemoteDesktopStatus
} from "../shared/types.js";

interface TunnelSession {
  id: string;
  server: net.Server;
  localPort: number;
}

const tunnels = new Map<string, TunnelSession>();

export async function testRemoteDesktop(
  device: Device,
  request: RemoteDesktopConfig
): Promise<RemoteDesktopStatus> {
  const host = requireHost(device);
  const port = normalizePort(request.noVncPort, 6080);
  const started = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok,
        host,
        port,
        url: buildNoVncUrl(host, port),
        message,
        elapsedMs: Date.now() - started
      });
    };

    socket.setTimeout(6000);
    socket.once("connect", () => finish(true, `noVNC ${host}:${port} reachable`));
    socket.once("timeout", () => finish(false, `noVNC ${host}:${port} timeout after 6000ms`));
    socket.once("error", (error) => finish(false, error.message));
  });
}

export async function startRemoteDesktop(
  device: Device,
  request: RemoteDesktopConfig
): Promise<RemoteDesktopStartResult> {
  const host = requireHost(device);
  const noVncPort = normalizePort(request.noVncPort, 6080);
  const display = normalizeDisplay(request.vncDisplay);
  const vncPort = 5900 + display;
  const width = clampInt(request.width, 800, 7680, 1920);
  const height = clampInt(request.height, 600, 4320, 1080);
  const depth = clampInt(request.depth, 16, 32, 24);
  const command = buildStartCommand({ noVncPort, display, vncPort, width, height, depth });
  const output = await execSsh(device, request.password, command, request.password ? `${request.password}\n` : "\n");
  const status = await testRemoteDesktop(device, request);
  return { ...status, output };
}

export async function installRemoteDesktopDependencies(
  device: Device,
  request: RemoteDesktopConfig
): Promise<RemoteDesktopStartResult> {
  if (device.authType === "password" && !request.password) {
    throw new Error("Installing desktop dependencies requires the SSH password for sudo.");
  }
  const command = [
    "sudo -S -p '' bash -lc",
    shellQuote(
      "set -e; " +
        "export DEBIAN_FRONTEND=noninteractive; " +
        "apt-get update; " +
        "apt-get install -y xfce4 xfce4-goodies tigervnc-standalone-server novnc websockify dbus-x11 xterm"
    )
  ].join(" ");
  const output = await execSsh(device, request.password, command, request.password ? `${request.password}\n` : undefined);
  const startResult = await startRemoteDesktop(device, request);
  return { ...startResult, output: [output, startResult.output].filter(Boolean).join("\n\n") };
}

export async function openRemoteDesktopClient(
  device: Device,
  request: RemoteDesktopConfig
): Promise<OperationResult> {
  const host = requireHost(device);
  const backend = request.backend ?? "xrdp";

  if (backend === "xrdp") {
    const port = normalizePort(request.rdpPort ?? 3389, 3389);
    launchDetached("mstsc.exe", [`/v:${host}:${port}`]);
    return {
      ok: true,
      message: `Opened Microsoft Remote Desktop: ${host}:${port}. On Ubuntu install and enable xrdp first.`
    };
  }

  if (backend === "rustdesk") {
    const exe = resolveExistingPath(request.rustDeskPath, [
      "C:\\Program Files\\RustDesk\\rustdesk.exe",
      "C:\\Program Files (x86)\\RustDesk\\rustdesk.exe",
      "rustdesk.exe"
    ]);
    const args = request.rustDeskId?.trim() ? [request.rustDeskId.trim()] : [];
    launchDetached(exe, args);
    return {
      ok: true,
      message: request.rustDeskId?.trim()
        ? `Opened RustDesk for device ID ${request.rustDeskId.trim()}.`
        : "Opened RustDesk. Enter the remote RustDesk ID in the client."
    };
  }

  if (backend === "moonlight") {
    const exe = resolveExistingPath(request.moonlightPath, [
      "C:\\Program Files\\Moonlight Game Streaming\\Moonlight.exe",
      "C:\\Program Files (x86)\\Moonlight Game Streaming\\Moonlight.exe",
      "Moonlight.exe"
    ]);
    const appName = request.moonlightApp?.trim() || "Desktop";
    const args = ["stream", host, appName];
    launchDetached(exe, args);
    return {
      ok: true,
      message: `Opened Moonlight stream request: ${host} / ${appName}. Pair Moonlight with Sunshine first.`
    };
  }

  return { ok: false, message: "noVNC is embedded in the app; use Connect/Reconnect instead." };
}

export async function openRemoteDesktopTunnel(
  device: Device,
  request: RemoteDesktopConfig
): Promise<RemoteDesktopStartResult> {
  const remotePort = normalizePort(request.noVncPort, 6080);
  const server = net.createServer((socket) => {
    let conn: Client | undefined;
    connectSsh(device, request.password)
      .then((nextConn) => {
        conn = nextConn;
        nextConn.forwardOut("127.0.0.1", 0, "127.0.0.1", remotePort, (error, stream) => {
          if (error) {
            socket.destroy(error);
            nextConn.end();
            return;
          }
          socket.pipe(stream);
          stream.pipe(socket);
          stream.on("close", () => {
            socket.destroy();
            nextConn.end();
          });
          stream.on("error", () => {
            socket.destroy();
            nextConn.end();
          });
        });
      })
      .catch((error) => socket.destroy(error));

    socket.on("close", () => conn?.end());
    socket.on("error", () => conn?.end());
  });

  const localPort = await listenLocal(server);
  const id = randomUUID();
  server.on("close", () => {
    tunnels.delete(id);
  });
  tunnels.set(id, { id, server, localPort });
  const url = buildMinimalNoVncUrl("127.0.0.1", localPort);
  try {
    await waitForHttpOk(url, 10000);
  } catch (error) {
    tunnels.delete(id);
    server.close();
    throw new Error(
      `SSH tunnel opened, but noVNC did not return a page through the tunnel: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return {
    ok: true,
    host: "127.0.0.1",
    port: localPort,
    url,
    message: `SSH tunnel opened: 127.0.0.1:${localPort} -> ${device.host}:127.0.0.1:${remotePort}`,
    elapsedMs: 0,
    output: `Tunnel id: ${id}\nOpen: ${url}`
  };
}

function buildStartCommand(options: {
  noVncPort: number;
  display: number;
  vncPort: number;
  width: number;
  height: number;
  depth: number;
}) {
  const webRootProbe = "[ -d /usr/share/novnc/core ] && [ -d /usr/share/novnc/vendor ] && echo /usr/share/novnc || echo ''";
  const logFile = `~/.remote-terminal-novnc-${options.noVncPort}.log`;
  return [
    "bash -lc",
    shellQuote(`
set -e
read -r VNC_PASSWORD || true
WS_BIN=$(command -v websock''ify || true)
if [ -z "$WS_BIN" ]; then
  echo "websockify not found. Install with: sudo apt install -y novnc websockify"
  exit 2
fi
if ! command -v ss >/dev/null 2>&1; then
  echo "ss command not found. Install iproute2 or start noVNC manually."
  exit 2
fi
WEB_ROOT=$(${webRootProbe})
if [ -z "$WEB_ROOT" ]; then
  echo "noVNC web root not found. Install with: sudo apt install -y novnc websockify"
  exit 2
fi
http_health_ok() {
  PORT="$1"
  python3 - "$PORT" <<'PY' >/dev/null 2>&1
import sys, urllib.request
port = sys.argv[1]
try:
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/remote.html?path=websockify', timeout=4) as response:
        response.read(64)
        raise SystemExit(0 if 200 <= response.status < 400 else 1)
except Exception:
    raise SystemExit(1)
PY
}
kill_listeners_on_port() {
  PORT="$1"
  PIDS=$(ss -ltnp 2>/dev/null | awk -v suffix=":$PORT" '$4 ~ suffix"$" {print}' | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | sort -u)
  for pid in $PIDS; do
    [ "$pid" = "$$" ] && continue
    echo "killing listener pid=$pid on port $PORT"
    kill "$pid" >/dev/null 2>&1 || true
  done
  sleep 1
  PIDS=$(ss -ltnp 2>/dev/null | awk -v suffix=":$PORT" '$4 ~ suffix"$" {print}' | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | sort -u)
  for pid in $PIDS; do
    [ "$pid" = "$$" ] && continue
    echo "force killing listener pid=$pid on port $PORT"
    kill -9 "$pid" >/dev/null 2>&1 || true
  done
}
APP_WEB_ROOT="$HOME/.remote-terminal-novnc-web"
mkdir -p "$APP_WEB_ROOT"
rm -rf "$APP_WEB_ROOT/core" "$APP_WEB_ROOT/vendor"
cp -a "$WEB_ROOT/core" "$APP_WEB_ROOT/core"
cp -a "$WEB_ROOT/vendor" "$APP_WEB_ROOT/vendor"
cat > "$APP_WEB_ROOT/remote.html" <<'REMOTEHTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Remote Desktop</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #030712; }
    #screen { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: hidden; display: block; background: #030712; }
    #screen canvas { outline: none; }
    #screen canvas { display: block; }
    #status { position: fixed; left: 8px; top: 8px; z-index: 10; padding: 8px 10px; border-radius: 8px; color: #e5e7eb; background: rgba(2, 6, 23, .88); font: 14px system-ui, sans-serif; }
    #credentials { position: fixed; inset: 0; display: none; place-items: center; z-index: 20; background: rgba(2, 6, 23, .72); font: 14px system-ui, sans-serif; }
    #credentials form { display: grid; gap: 10px; width: min(360px, calc(100vw - 32px)); padding: 22px; border-radius: 16px; color: #e5e7eb; background: #111827; box-shadow: 0 18px 80px rgba(0, 0, 0, .35); }
    #credentials input, #credentials button { border: 0; border-radius: 10px; padding: 11px 12px; font: inherit; }
    #credentials input { color: #e5e7eb; background: #020617; outline: 1px solid #334155; }
    #credentials button { cursor: pointer; font-weight: 700; background: linear-gradient(135deg, #67d4ff, #7c5cff); color: #020617; }
  </style>
</head>
<body>
  <div id="status">Loading remote desktop...</div>
  <div id="credentials">
    <form>
      <strong>VNC password required</strong>
      <input id="password" type="password" autocomplete="current-password" autofocus />
      <button type="submit">Connect</button>
    </form>
  </div>
  <div id="screen"></div>
  <script type="module">
    import RFB from './core/rfb.js';

    const params = new URLSearchParams(window.location.search);
    const path = params.get('path') || 'websockify';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const status = document.getElementById('status');
    const credentials = document.getElementById('credentials');
    const password = document.getElementById('password');
    const screen = document.getElementById('screen');
    const url = protocol + '//' + window.location.host + '/' + path;
    const initialPassword = params.get('password') || '';
    const rfb = new RFB(screen, url, initialPassword ? { credentials: { password: initialPassword } } : {});

    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.showDotCursor = true;
    rfb.clipViewport = false;
    rfb.focusOnClick = true;
    rfb.compressionLevel = 9;
    rfb.qualityLevel = 4;

    const applyNativeFit = () => {
      try {
        rfb.clipViewport = false;
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
      } catch {}
    };
    const scheduleNativeFit = () => [80, 250, 750, 1500, 3000].forEach((delay) => setTimeout(applyNativeFit, delay));
    const observer = new ResizeObserver(scheduleNativeFit);
    observer.observe(screen);
    window.addEventListener('resize', scheduleNativeFit);
    scheduleNativeFit();

    rfb.addEventListener('connect', () => {
      status.textContent = 'Connected';
      applyNativeFit();
      scheduleNativeFit();
      try { screen.focus(); } catch {}
      setTimeout(() => status.remove(), 1200);
    });
    rfb.addEventListener('disconnect', (event) => { status.textContent = event.detail.clean ? 'Disconnected' : 'Disconnected unexpectedly'; });
    rfb.addEventListener('securityfailure', (event) => { status.textContent = 'Security failure: ' + (event.detail.reason || 'unknown'); });
    rfb.addEventListener('credentialsrequired', () => {
      status.textContent = 'VNC password required';
      credentials.style.display = 'grid';
      password.focus();
    });
    credentials.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      rfb.sendCredentials({ password: password.value });
      credentials.style.display = 'none';
      status.textContent = 'Connecting...';
    });
  </script>
</body>
</html>
REMOTEHTML
WEB_ROOT="$APP_WEB_ROOT"
if [ ! -f "$HOME/.vnc/passwd" ] && [ -n "$VNC_PASSWORD" ] && command -v vncpasswd >/dev/null 2>&1; then
  mkdir -p "$HOME/.vnc"
  printf "%s\\n" "$VNC_PASSWORD" | vncpasswd -f > "$HOME/.vnc/passwd"
  chmod 600 "$HOME/.vnc/passwd"
  echo "created ~/.vnc/passwd from the supplied session password"
fi
mkdir -p "$HOME/.vnc"
cat > "$HOME/.vnc/xstartup" <<'XSTARTUP'
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
export XKL_XMODMAP_DISABLE=1
[ -r "$HOME/.Xresources" ] && xrdb "$HOME/.Xresources"
xsetroot -solid grey
xterm -geometry 120x40+40+40 -title "VNC fallback terminal" &
if command -v dbus-launch >/dev/null 2>&1 && command -v startxfce4 >/dev/null 2>&1; then
  dbus-launch --exit-with-session startxfce4 &
elif command -v startxfce4 >/dev/null 2>&1; then
  startxfce4 &
elif command -v xfce4-session >/dev/null 2>&1; then
  xfce4-session &
else
  echo "No desktop session command found. Keeping fallback xterm only."
fi
sleep 4
DISPLAY=:${options.display} xset s off -dpms >/dev/null 2>&1 || true
DISPLAY=:${options.display} xfce4-screensaver-command --exit >/dev/null 2>&1 || true
for pid in $(pgrep -x xfce4-screensaver 2>/dev/null); do kill "$pid" >/dev/null 2>&1 || true; done
wait
XSTARTUP
chmod +x "$HOME/.vnc/xstartup"
echo "wrote ~/.vnc/xstartup for XFCE"
if ! command -v vncserver >/dev/null 2>&1; then
  echo "vncserver command was not found."
  echo "Install one option: sudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server novnc websockify dbus-x11 xterm"
  exit 2
fi
XVNC_BIN=$(command -v Xtiger''vnc || true)
XVNC_PATTERN='[X]tiger''vnc'
XVNCL_PATTERN='[X]vnc'
VNC_ALREADY_RUNNING=0
if ss -ltn | awk '{print $4}' | grep -Eq '(:|\\])${options.vncPort}$'; then
  VNC_ALREADY_RUNNING=1
  echo "VNC display :${options.display} is already listening on port ${options.vncPort}; reusing the existing desktop session for stability"
fi
if [ "$VNC_ALREADY_RUNNING" = "0" ] && [ -n "$XVNC_BIN" ]; then
  if [ ! -f "$HOME/.vnc/passwd" ]; then
    echo "VNC password file ~/.vnc/passwd was not found. Enter the SSH/VNC password and start again."
    exit 2
  fi
  for pid in $(pgrep -f "$XVNC_PATTERN.*:${options.display}" 2>/dev/null); do [ "$pid" = "$$" ] && continue; kill "$pid" >/dev/null 2>&1 || true; done
  for pid in $(pgrep -f "$XVNCL_PATTERN.*:${options.display}" 2>/dev/null); do [ "$pid" = "$$" ] && continue; kill "$pid" >/dev/null 2>&1 || true; done
  for pid in $(pgrep -f '[r]emote-terminal-vnc-session-${options.display}' 2>/dev/null); do [ "$pid" = "$$" ] && continue; kill "$pid" >/dev/null 2>&1 || true; done
  sleep 1
  nohup "$XVNC_BIN" :${options.display} -geometry ${options.width}x${options.height} -depth ${options.depth} -rfbauth "$HOME/.vnc/passwd" -SecurityTypes VncAuth -localhost yes -AlwaysShared > "$HOME/.vnc/remote-terminal-xvnc-${options.display}.log" 2>&1 &
  echo "started TigerVNC pid=$! display=:${options.display} port=${options.vncPort}"
  sleep 2
  if ! ss -ltn | awk '{print $4}' | grep -Eq '(:|\\])${options.vncPort}$'; then
    echo "Xtigervnc did not open port ${options.vncPort}. See ~/.vnc/remote-terminal-xvnc-${options.display}.log"
    exit 2
  fi
  nohup bash -lc 'export DISPLAY=:${options.display}; exec -a remote-terminal-vnc-session-${options.display} "$HOME/.vnc/xstartup"' > "$HOME/.vnc/remote-terminal-session-${options.display}.log" 2>&1 &
  echo "started XFCE/xstartup pid=$!"
elif [ "$VNC_ALREADY_RUNNING" = "0" ]; then
  vncserver :${options.display} -geometry ${options.width}x${options.height} -depth ${options.depth} -xstartup "$HOME/.vnc/xstartup"
fi
if ss -ltn | awk '{print $4}' | grep -Eq '(:|\\])${options.noVncPort}$'; then
  if http_health_ok ${options.noVncPort}; then
    echo "noVNC port ${options.noVncPort} is already listening and HTTP health check is OK; reusing listener"
  else
    echo "noVNC port ${options.noVncPort} is listening but HTTP health check failed; restarting listener process"
    kill_listeners_on_port ${options.noVncPort}
    sleep 1
  fi
fi
if ss -ltn | awk '{print $4}' | grep -Eq '(:|\\])${options.noVncPort}$'; then
  if http_health_ok ${options.noVncPort}; then
    :
  else
    echo "port ${options.noVncPort} is still in use but noVNC HTTP is unhealthy"
    exit 2
  fi
else
  nohup "$WS_BIN" --web="$WEB_ROOT" 0.0.0.0:${options.noVncPort} localhost:${options.vncPort} > ${logFile} 2>&1 &
  echo "started noVNC pid=$! port=${options.noVncPort} -> localhost:${options.vncPort} web=$WEB_ROOT"
  sleep 1
fi
python3 - <<'PY'
import urllib.request
url = 'http://127.0.0.1:${options.noVncPort}/remote.html?path=websockify'
try:
    with urllib.request.urlopen(url, timeout=8) as response:
        response.read(64)
        print('local noVNC HTTP health check OK:', response.status)
except Exception as exc:
    print('local noVNC HTTP health check failed:', repr(exc))
    raise SystemExit(2)
PY
REMOTE_IP=$(hostname -I | awk '{print $1}')
echo "URL: http://$REMOTE_IP:${options.noVncPort}/vnc_lite.html?host=$REMOTE_IP&port=${options.noVncPort}&path=websockify&autoconnect=true&resize=scale"
`)
  ].join(" ");
}

function execSsh(device: Device, password: string | undefined, command: string, stdin?: string): Promise<string> {
  return connectSsh(device, password).then(
    (conn) =>
      new Promise((resolve, reject) => {
        let output = "";
        conn.exec(command, (error, stream) => {
          if (error) {
            conn.end();
            reject(error);
            return;
          }
          stream.on("data", (data: Buffer) => {
            output += data.toString("utf8");
          });
          stream.stderr.on("data", (data: Buffer) => {
            output += data.toString("utf8");
          });
          if (stdin) {
            stream.write(stdin);
            stream.end();
          }
          stream.on("close", (code: number | null) => {
            conn.end();
            if (code && code !== 0) {
              reject(new Error(output.trim() || `Remote command exited with code ${code}`));
            } else {
              resolve(output.trim());
            }
          });
        });
      })
  );
}

function connectSsh(device: Device, password: string | undefined): Promise<Client> {
  const conn = new Client();
  const config = {
    host: device.host,
    port: device.port ?? 22,
    username: device.username,
    password: device.authType === "password" ? password : undefined,
    privateKey:
      device.authType === "privateKey" && device.privateKeyPath
        ? readFileSync(device.privateKeyPath)
        : undefined,
    readyTimeout: 20000,
    keepaliveInterval: 15000
  };

  return new Promise((resolve, reject) => {
    conn
      .on("ready", () => resolve(conn))
      .on("error", reject)
      .connect(config);
  });
}

function listenLocal(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate local tunnel port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
        resolve();
      } else {
        reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
      }
    });

    request.once("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.once("error", reject);
  });
}

function launchDetached(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
}

function resolveExistingPath(preferred: string | undefined, candidates: string[]) {
  if (preferred?.trim()) return preferred.trim();
  for (const candidate of candidates) {
    if (candidate.endsWith(".exe") && candidate.includes(":") && !existsSync(candidate)) continue;
    return candidate;
  }
  return candidates[candidates.length - 1];
}

function buildNoVncUrl(host: string, port: number) {
  return buildMinimalNoVncUrl(host, port);
}

function buildMinimalNoVncUrl(host: string, port: number) {
  const params = new URLSearchParams({ path: "websockify" });
  return `http://${host}:${port}/remote.html?${params.toString()}`;
}

function requireHost(device: Device): string {
  if (!device.host) throw new Error("Device host is empty");
  return device.host;
}

function normalizePort(value: number, fallback: number) {
  return clampInt(value, 1, 65535, fallback);
}

function normalizeDisplay(value: number) {
  return clampInt(value, 1, 99, 1);
}

function clampInt(value: number, min: number, max: number, fallback: number) {
  const next = Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, next));
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
