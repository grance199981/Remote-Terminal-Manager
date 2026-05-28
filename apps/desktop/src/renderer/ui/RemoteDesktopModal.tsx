import { useEffect, useMemo, useState } from "react";
import type { Device, RemoteDesktopBackend, RemoteDesktopConfig } from "../../shared/types";

const UI = {
  title: "\u8fdc\u7a0b\u684c\u9762",
  subtitle: "\u57fa\u4e8e Tailscale IP + noVNC/VNC \u7684 Ubuntu GUI \u8fdc\u7a0b\u753b\u9762",
  noVncPort: "noVNC \u7aef\u53e3",
  display: "VNC \u663e\u793a\u53f7",
  resolution: "\u5206\u8fa8\u7387",
  backend: "\u8fdc\u7a0b\u684c\u9762\u65b9\u6848",
  rdpPort: "xRDP \u7aef\u53e3",
  rustDeskId: "RustDesk ID",
  rustDeskPath: "RustDesk.exe \u8def\u5f84",
  moonlightPath: "Moonlight.exe \u8def\u5f84",
  moonlightApp: "Moonlight \u5e94\u7528",
  depth: "\u8272\u6df1",
  password: "SSH \u5bc6\u7801",
  passwordPlaceholder: "\u7528\u4e8e SSH \u542f\u52a8/\u96a7\u9053",
  showPassword: "\u663e\u793a",
  hidePassword: "\u9690\u85cf",
  connect: "\u8fde\u63a5/\u91cd\u8fde",
  launchClient: "\u6253\u5f00\u5ba2\u6237\u7aef",
  openExternal: "\u6d4f\u89c8\u5668\u6253\u5f00",
  reload: "\u5237\u65b0\u753b\u9762",
  advanced: "\u9ad8\u7ea7\u8bbe\u7f6e",
  hideAdvanced: "\u6536\u8d77\u9ad8\u7ea7",
  test: "\u68c0\u6d4b\u7aef\u53e3",
  start: "\u4ec5\u542f\u52a8 noVNC",
  install: "\u5b89\u88c5\u4f9d\u8d56\u5e76\u542f\u52a8",
  openDirect: "\u76f4\u8fde\u6253\u5f00",
  close: "X",
  ready: "\u8f93\u5165 SSH \u5bc6\u7801\u540e\u70b9\u51fb\u8fde\u63a5/\u91cd\u8fde\u3002",
  externalReady: "\u9009\u62e9 xRDP / RustDesk / Moonlight \u540e\u70b9\u51fb\u6253\u5f00\u5ba2\u6237\u7aef\u3002",
  checking: "\u6b63\u5728\u68c0\u6d4b noVNC \u7aef\u53e3...",
  starting: "\u6b63\u5728\u542f\u52a8\u8fdc\u7a0b\u684c\u9762\u5e76\u5efa\u7acb SSH \u96a7\u9053...",
  serviceStarting: "\u6b63\u5728\u901a\u8fc7 SSH \u542f\u52a8\u8fdc\u7a0b\u684c\u9762\u670d\u52a1...",
  installing: "\u6b63\u5728\u901a\u8fc7 sudo \u5b89\u88c5 Ubuntu \u684c\u9762\u4f9d\u8d56\uff0c\u53ef\u80fd\u9700\u8981\u51e0\u5206\u949f...",
  opened: "\u5df2\u6253\u5f00\u8fdc\u7a0b\u684c\u9762\u753b\u9762",
  connected: "\u5df2\u8fde\u63a5\u8fdc\u7a0b\u684c\u9762",
  installHint: "\u82e5\u542f\u52a8\u5931\u8d25\uff0c\u9700\u8981\u7ba1\u7406\u5458\u5728 Ubuntu \u4e0a\u5b89\u88c5\uff1asudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server tigervnc-common novnc websockify dbus-x11 xterm"
};

interface RemoteDesktopModalProps {
  device: Device;
  onClose(): void;
}

interface SavedDesktopConfig {
  backend: RemoteDesktopBackend;
  noVncPort: number;
  vncDisplay: number;
  width: number;
  height: number;
  depth: number;
  rdpPort: number;
  rustDeskId: string;
  rustDeskPath: string;
  moonlightPath: string;
  moonlightApp: string;
}

const DEFAULT_CONFIG: SavedDesktopConfig = {
  backend: "xrdp",
  noVncPort: 6080,
  vncDisplay: 1,
  width: 1280,
  height: 720,
  depth: 16,
  rdpPort: 3389,
  rustDeskId: "",
  rustDeskPath: "",
  moonlightPath: "",
  moonlightApp: "Desktop"
};

export function RemoteDesktopModal({ device, onClose }: RemoteDesktopModalProps) {
  const [config, setConfig] = useState<SavedDesktopConfig>(() => loadSavedConfig(device.id));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(UI.ready);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerKey, setViewerKey] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    saveConfig(device.id, config);
  }, [device.id, config]);


  const request = useMemo<RemoteDesktopConfig>(
    () => ({
      deviceId: device.id,
      backend: config.backend,
      password: password || undefined,
      noVncPort: config.noVncPort,
      vncDisplay: config.vncDisplay,
      width: config.width,
      height: config.height,
      depth: config.depth,
      rdpPort: config.rdpPort,
      rustDeskId: config.rustDeskId,
      rustDeskPath: config.rustDeskPath,
      moonlightPath: config.moonlightPath,
      moonlightApp: config.moonlightApp
    }),
    [config, device.id, password]
  );

  const directUrl = useMemo(() => buildViewerUrl(device.host ?? "", config.noVncPort), [device.host, config.noVncPort]);
  const needsSshPassword = device.authType !== "privateKey";
  const usesNoVnc = config.backend === "novnc";
  const canUseSsh = !needsSshPassword || Boolean(password);
  const canLaunchExternal = config.backend === "xrdp" || config.backend === "rustdesk" || config.backend === "moonlight";

  async function launchExternalClient() {
    try {
      setBusy(true);
      setError(null);
      setOutput("");
      const result = await window.remoteTerminal.desktop.openClient(request);
      setStatus(result.message);
      if (!result.ok) setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u6253\u5f00\u5ba2\u6237\u7aef\u5931\u8d25");
    } finally {
      setBusy(false);
    }
  }

  async function connectDesktop() {
    try {
      setBusy(true);
      setError(null);
      setOutput("");
      setStatus(UI.starting);

      const startResult = await window.remoteTerminal.desktop.start(request);
      const logs = [startResult.output].filter(Boolean);
      if (!startResult.ok) {
        setOutput(logs.join("\n\n"));
        setError(startResult.message);
        setStatus("\u542f\u52a8\u5931\u8d25");
        return;
      }

      const tunnelResult = await window.remoteTerminal.desktop.tunnel(request);
      logs.push(tunnelResult.output);
      setOutput(logs.filter(Boolean).join("\n\n"));
      setStatus(UI.connected);
      setViewerUrl(tunnelResult.url);
      setViewerKey((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u8fde\u63a5\u5931\u8d25");
    } finally {
      setBusy(false);
    }
  }

  async function testPort() {
    try {
      setBusy(true);
      setError(null);
      setStatus(UI.checking);
      const result = await window.remoteTerminal.desktop.test(request);
      setStatus(result.message);
      if (!result.ok) setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u68c0\u6d4b\u5931\u8d25");
    } finally {
      setBusy(false);
    }
  }

  async function startDesktopOnly() {
    try {
      setBusy(true);
      setError(null);
      setOutput("");
      setStatus(UI.serviceStarting);
      const result = await window.remoteTerminal.desktop.start(request);
      setOutput(result.output);
      setStatus(result.message);
      if (result.ok) setViewerUrl(result.url);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u542f\u52a8\u5931\u8d25");
    } finally {
      setBusy(false);
    }
  }

  async function installAndStart() {
    if (!confirm("\u5c06\u5728 Ubuntu \u4e0a\u6267\u884c sudo apt-get update/install \u5b89\u88c5 XFCE\u3001TigerVNC\u3001noVNC\u3001websockify\u3002\u662f\u5426\u7ee7\u7eed\uff1f")) return;
    try {
      setBusy(true);
      setError(null);
      setOutput("");
      setStatus(UI.installing);
      const result = await window.remoteTerminal.desktop.install(request);
      setOutput(result.output);
      setStatus(result.message);
      if (result.ok) setViewerUrl(result.url);
      else setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u5b89\u88c5\u6216\u542f\u52a8\u5931\u8d25");
    } finally {
      setBusy(false);
    }
  }

  function openDirectViewer() {
    setError(null);
    setViewerUrl(directUrl);
    setViewerKey((current) => current + 1);
    setStatus(UI.opened);
  }

  function reloadViewer() {
    setViewerKey((current) => current + 1);
  }

  function openExternalViewer() {
    window.open(viewerUrl || directUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="modal-backdrop desktop-backdrop">
      <section className="desktop-modal">
        <header className="modal-header desktop-header">
          <div>
            <h2>{UI.title} - {device.name}</h2>
            <p>{device.username}@{device.host}:{device.port ?? 22} · {UI.subtitle}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>{UI.close}</button>
        </header>

        <div className="desktop-mainbar">
          <label className="desktop-resolution compact">
            {UI.backend}
            <select
              value={config.backend}
              onChange={(event) => {
                const backend = event.target.value as RemoteDesktopBackend;
                setConfig((current) => ({ ...current, backend }));
                setViewerUrl("");
                setStatus(backend === "novnc" ? UI.ready : UI.externalReady);
              }}
            >
              <option value="xrdp">xRDP / Windows Remote Desktop（推荐）</option>
              <option value="moonlight">Sunshine + Moonlight（高性能）</option>
              <option value="rustdesk">RustDesk（外部客户端）</option>
              <option value="novnc">noVNC（内嵌备用）</option>
            </select>
          </label>

          {usesNoVnc && needsSshPassword ? (
            <label className="desktop-password compact">
              {UI.password}
              <span className="desktop-password-field compact">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={UI.passwordPlaceholder}
                  autoComplete="current-password"
                  spellCheck={false}
                />
                <button type="button" className="secondary" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? UI.hidePassword : UI.showPassword}
                </button>
              </span>
            </label>
          ) : null}

          {usesNoVnc ? (
            <label className="desktop-resolution compact">
            {UI.resolution}
            <select
              value={`${config.width}x${config.height}`}
              onChange={(event) => {
                const [width, height] = event.target.value.split("x").map(Number);
                setConfig((current) => ({ ...current, width, height }));
              }}
            >
              <option value="1280x720">1280x720</option>
              <option value="1600x900">1600x900</option>
              <option value="1920x1080">1920x1080</option>
              <option value="2560x1440">2560x1440</option>
            </select>
            </label>
          ) : config.backend === "xrdp" ? (
            <label className="desktop-resolution compact">
              {UI.rdpPort}
              <input
                type="number"
                min={1}
                max={65535}
                value={config.rdpPort}
                onChange={(event) => setConfig((current) => ({ ...current, rdpPort: Number(event.target.value) }))}
              />
            </label>
          ) : config.backend === "rustdesk" ? (
            <label className="desktop-resolution compact">
              {UI.rustDeskId}
              <input
                value={config.rustDeskId}
                onChange={(event) => setConfig((current) => ({ ...current, rustDeskId: event.target.value }))}
                placeholder="\u670d\u52a1\u5668 RustDesk ID"
              />
            </label>
          ) : (
            <label className="desktop-resolution compact">
              {UI.moonlightApp}
              <input
                value={config.moonlightApp}
                onChange={(event) => setConfig((current) => ({ ...current, moonlightApp: event.target.value }))}
                placeholder="Desktop"
              />
            </label>
          )}

          <div className="desktop-primary-actions">
            {usesNoVnc ? (
              <button onClick={() => void connectDesktop()} disabled={busy || !canUseSsh}>{busy ? "\u8fde\u63a5\u4e2d..." : UI.connect}</button>
            ) : (
              <button onClick={() => void launchExternalClient()} disabled={busy || !canLaunchExternal}>
                {busy ? "\u6253\u5f00\u4e2d..." : UI.launchClient}
              </button>
            )}
            {usesNoVnc ? <button className="secondary" onClick={openExternalViewer} disabled={busy || !device.host}>{UI.openExternal}</button> : null}
            {usesNoVnc ? <button className="secondary" onClick={reloadViewer} disabled={!viewerUrl}>{UI.reload}</button> : null}
            <button className="secondary" onClick={() => setAdvancedOpen((current) => !current)}>{advancedOpen ? UI.hideAdvanced : UI.advanced}</button>
          </div>
        </div>

        {advancedOpen ? (
          <div className="desktop-advanced">
            {usesNoVnc ? (
              <>
                <label>
                  {UI.noVncPort}
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={config.noVncPort}
                    onChange={(event) => setConfig((current) => ({ ...current, noVncPort: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  {UI.display}
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={config.vncDisplay}
                    onChange={(event) => setConfig((current) => ({ ...current, vncDisplay: Number(event.target.value) }))}
                  />
                </label>
                <label>
                  {UI.depth}
                  <select
                    value={config.depth}
                    onChange={(event) => setConfig((current) => ({ ...current, depth: Number(event.target.value) }))}
                  >
                    <option value={16}>16</option>
                    <option value={24}>24</option>
                    <option value={32}>32</option>
                  </select>
                </label>
                <button className="secondary" onClick={() => void testPort()} disabled={busy}>{UI.test}</button>
                <button className="secondary" onClick={() => void startDesktopOnly()} disabled={busy || !canUseSsh}>{UI.start}</button>
                <button className="secondary" onClick={openDirectViewer} disabled={busy || !device.host}>{UI.openDirect}</button>
                <button className="secondary" onClick={() => void installAndStart()} disabled={busy || !canUseSsh}>{UI.install}</button>
              </>
            ) : config.backend === "xrdp" ? (
              <p className="desktop-hint">Ubuntu \u7aef\u9700\u8981\u7ba1\u7406\u5458\u5b89\u88c5\uff1a<code>sudo apt install -y xrdp xfce4 xfce4-goodies dbus-x11</code>\uff0c\u5e76\u786e\u4fdd Tailscale ACL \u5141\u8bb8 3389\u3002</p>
            ) : config.backend === "rustdesk" ? (
              <>
                <label>
                  {UI.rustDeskPath}
                  <input
                    value={config.rustDeskPath}
                    onChange={(event) => setConfig((current) => ({ ...current, rustDeskPath: event.target.value }))}
                    placeholder="C:\\Program Files\\RustDesk\\rustdesk.exe"
                  />
                </label>
                <p className="desktop-hint">RustDesk \u9700\u8981\u670d\u52a1\u5668\u548c\u672c\u673a\u90fd\u5b89\u88c5 RustDesk\uff0c\u670d\u52a1\u5668\u4e0a\u767b\u5f55\u6216\u8bb0\u5f55 ID \u540e\u4f7f\u7528\u3002</p>
              </>
            ) : (
              <>
                <label>
                  {UI.moonlightPath}
                  <input
                    value={config.moonlightPath}
                    onChange={(event) => setConfig((current) => ({ ...current, moonlightPath: event.target.value }))}
                    placeholder="C:\\Program Files\\Moonlight Game Streaming\\Moonlight.exe"
                  />
                </label>
                <p className="desktop-hint">Sunshine + Moonlight \u9700\u8981\u5148\u5728 Ubuntu \u4e0a\u542f\u52a8 Sunshine \u5e76\u4e0e\u672c\u673a Moonlight \u914d\u5bf9\uff0c\u4e4b\u540e\u518d\u4ece\u8fd9\u91cc\u542f\u52a8\u3002</p>
              </>
            )}
          </div>
        ) : null}

        <div className="desktop-status compact">
          <span>{status}</span>
          <code>{viewerUrl || directUrl}</code>
        </div>

        {error ? <div className="error-banner desktop-error">{error}<br />{UI.installHint}</div> : null}

        {advancedOpen && output ? (
          <details className="desktop-log">
            <summary>\u8fd0\u884c\u65e5\u5fd7</summary>
            <pre className="desktop-output">{output}</pre>
          </details>
        ) : null}

        {usesNoVnc ? (
          <div className="desktop-viewer">
            {viewerUrl ? (
            <iframe
              key={viewerKey}
              title={`${UI.title} ${device.name}`}
              src={viewerUrl}
              allow="clipboard-read; clipboard-write"
              />
            ) : (
              <div className="desktop-empty">
                <strong>noVNC</strong>
                <span>{UI.ready}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="desktop-viewer desktop-external-info">
            <div className="desktop-empty">
              <strong>{config.backend === "xrdp" ? "xRDP" : config.backend === "moonlight" ? "Moonlight" : "RustDesk"}</strong>
              <span>
                {config.backend === "xrdp"
                  ? "\u5c06\u4f7f\u7528 Windows \u81ea\u5e26\u7684 mstsc \u6253\u5f00\uff0c\u6d41\u7545\u5ea6\u4f18\u4e8e noVNC\u3002"
                  : config.backend === "moonlight"
                    ? "\u5c06\u4f7f\u7528 Moonlight \u5916\u90e8\u5ba2\u6237\u7aef\uff0c\u9700\u5148\u4e0e Sunshine \u914d\u5bf9\u3002"
                    : "\u5c06\u4f7f\u7528 RustDesk \u5916\u90e8\u5ba2\u6237\u7aef\u3002"}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function buildViewerUrl(host: string, port: number) {
  if (!host) return "";
  const params = new URLSearchParams({ path: "websockify" });
  return `http://${host}:${port}/remote.html?${params.toString()}`;
}

function loadSavedConfig(deviceId: string): SavedDesktopConfig {
  try {
    const raw = localStorage.getItem(storageKey(deviceId));
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(deviceId: string, config: SavedDesktopConfig) {
  localStorage.setItem(storageKey(deviceId), JSON.stringify(config));
}

function storageKey(deviceId: string) {
  return `remote-desktop:${deviceId}`;
}
