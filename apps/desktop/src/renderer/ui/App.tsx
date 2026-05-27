import { useEffect, useMemo, useState } from "react";
import type { Device, DeviceDraft, LocalShell } from "../../shared/types";
import { DeviceEditor } from "./DeviceEditor";
import { FileTransferModal } from "./FileTransferModal";
import { PasswordPrompt } from "./PasswordPrompt";
import { RemoteDesktopModal } from "./RemoteDesktopModal";
import { TerminalPane, type TerminalTab } from "./TerminalPane";

const T = {
  ready: "\u51c6\u5907\u5c31\u7eea",
  brandSub: "\u6388\u6743\u8bbe\u5907 SSH / \u672c\u673a\u7ec8\u7aef",
  devices: "\u8bbe\u5907",
  add: "\u65b0\u589e",
  emptyTitle: "\u8fd8\u6ca1\u6709\u8bbe\u5907",
  emptyHint: "\u6dfb\u52a0 SSH \u4e3b\u673a\u540e\u5373\u53ef\u6253\u5f00\u5185\u7f6e\u7ec8\u7aef\u3002",
  localTerminal: "\u672c\u673a\u7ec8\u7aef",
  connecting: "\u8fde\u63a5\u4e2d...",
  privateKey: "\u79c1\u94a5\u767b\u5f55",
  password: "\u5bc6\u7801\u767b\u5f55",
  connectSsh: "\u8fde\u63a5 SSH",
  edit: "\u7f16\u8f91",
  test: "\u6d4b\u8bd5",
  file: "\u6587\u4ef6",
  desktop: "\u684c\u9762",
  delete: "\u5220\u9664",
  workspace: "\u7ec8\u7aef\u5de5\u4f5c\u533a",
  close: "\u5173\u95ed",
  cancelled: "\u5df2\u53d6\u6d88 SSH \u8fde\u63a5"
};

const emptyDraft: DeviceDraft = {
  name: "",
  type: "ssh",
  host: "",
  port: 22,
  username: "",
  authType: "password",
  privateKeyPath: "",
  tags: []
};

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeviceDraft | null>(null);
  const [passwordDevice, setPasswordDevice] = useState<Device | null>(null);
  const [fileDevice, setFileDevice] = useState<Device | null>(null);
  const [desktopDevice, setDesktopDevice] = useState<Device | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [status, setStatus] = useState(T.ready);
  const [error, setError] = useState<string | null>(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? devices[0],
    [devices, selectedDeviceId]
  );

  useEffect(() => {
    void refreshDevices();
  }, []);

  async function refreshDevices() {
    const next = await window.remoteTerminal.devices.list();
    setDevices(next);
    setSelectedDeviceId((current) => current ?? next[0]?.id ?? null);
  }

  async function saveDevice(draft: DeviceDraft) {
    try {
      setError(null);
      const saved = await window.remoteTerminal.devices.save(draft);
      await refreshDevices();
      setSelectedDeviceId(saved.id);
      setEditing(null);
      setStatus(`\u5df2\u4fdd\u5b58\u8bbe\u5907\uff1a${saved.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteSelectedDevice() {
    if (!selectedDevice) return;
    if (!confirm(`\u786e\u5b9a\u5220\u9664\u8bbe\u5907\u201c${selectedDevice.name}\u201d\uff1f`)) return;
    await window.remoteTerminal.devices.delete(selectedDevice.id);
    setStatus(`\u5df2\u5220\u9664\u8bbe\u5907\uff1a${selectedDevice.name}`);
    setSelectedDeviceId(null);
    await refreshDevices();
  }

  async function testSelectedDevice() {
    if (!selectedDevice) return;
    try {
      setError(null);
      setTestingDeviceId(selectedDevice.id);
      setStatus(`\u6b63\u5728\u6d4b\u8bd5 ${selectedDevice.host}:${selectedDevice.port ?? 22} ...`);
      const result = await window.remoteTerminal.devices.test(selectedDevice.id);
      if (result.ok) {
        setStatus(`\u6d4b\u8bd5\u6210\u529f\uff1a${result.host}:${result.port} \u53ef\u8fbe\uff0c${result.elapsedMs}ms`);
      } else {
        setStatus(`\u6d4b\u8bd5\u5931\u8d25\uff1a${selectedDevice.name}`);
        setError(`TCP \u6d4b\u8bd5\u5931\u8d25\uff1a${result.message}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u6d4b\u8bd5\u5931\u8d25");
    } finally {
      setTestingDeviceId(null);
    }
  }

  async function openLocal(shell: LocalShell) {
    try {
      setError(null);
      setStatus(`\u6b63\u5728\u542f\u52a8\u672c\u673a ${shell === "cmd" ? "CMD" : "PowerShell"}...`);
      const response = await window.remoteTerminal.terminals.create({
        kind: "local",
        shell,
        cols: 100,
        rows: 30
      });
      addTab({ id: response.id, title: response.title, kind: "local", status: "connected" });
      setStatus(`\u5df2\u542f\u52a8\u672c\u673a ${response.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("\u672c\u673a\u7ec8\u7aef\u542f\u52a8\u5931\u8d25");
    }
  }

  function openSsh(device: Device | undefined) {
    if (!device || device.type !== "ssh") return;
    setError(null);
    if (device.authType === "password") {
      setPasswordDevice(device);
      setStatus(`\u7b49\u5f85\u8f93\u5165 ${device.name} \u7684 SSH \u5bc6\u7801`);
      return;
    }
    void connectSsh(device);
  }

  async function connectSsh(device: Device, password?: string) {
    try {
      setError(null);
      setConnectingDeviceId(device.id);
      setStatus(`\u6b63\u5728\u8fde\u63a5 ${device.username}@${device.host}:${device.port ?? 22} ...`);
      const response = await window.remoteTerminal.terminals.create({
        kind: "ssh",
        deviceId: device.id,
        password,
        cols: 100,
        rows: 30
      });
      addTab({ id: response.id, title: response.title, kind: "ssh", status: "connected" });
      setStatus(`\u5df2\u8fde\u63a5\uff1a${device.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`\u8fde\u63a5 ${device.name} \u5931\u8d25\uff1a${message}`);
      setStatus(`\u8fde\u63a5\u5931\u8d25\uff1a${device.name}`);
    } finally {
      setConnectingDeviceId(null);
    }
  }

  function addTab(tab: TerminalTab) {
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    window.remoteTerminal.terminals.close(id);
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setActiveTabId((current) => {
      if (current !== id) return current;
      const remaining = tabs.filter((tab) => tab.id !== id);
      return remaining.at(-1)?.id ?? null;
    });
  }

  const isConnecting = Boolean(connectingDeviceId);
  const isTesting = Boolean(testingDeviceId);
  const isBusy = isConnecting || isTesting;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">RT</div>
          <div>
            <h1>Remote Terminal</h1>
            <p>{T.brandSub}</p>
          </div>
        </div>

        <div className="section-title">
          <span>{T.devices}</span>
          <button onClick={() => setEditing(emptyDraft)}>{T.add}</button>
        </div>

        <div className="device-list">
          {devices.length === 0 ? (
            <div className="empty-card">
              <strong>{T.emptyTitle}</strong>
              <span>{T.emptyHint}</span>
            </div>
          ) : (
            devices.map((device) => (
              <button
                key={device.id}
                className={`device-card ${selectedDevice?.id === device.id ? "active" : ""}`}
                onClick={() => setSelectedDeviceId(device.id)}
              >
                <span className="device-name">{device.name}</span>
                <span className="device-host">
                  {device.type === "ssh"
                    ? `${device.username}@${device.host}:${device.port ?? 22}`
                    : T.localTerminal}
                </span>
                <span className="device-auth">
                  {connectingDeviceId === device.id
                    ? T.connecting
                    : testingDeviceId === device.id
                      ? "\u6d4b\u8bd5\u4e2d..."
                      : device.authType === "privateKey"
                        ? T.privateKey
                        : T.password}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="sidebar-actions four-actions">
          <button disabled={!selectedDevice || isBusy} onClick={() => openSsh(selectedDevice)}>
            {isConnecting ? "\u8fde\u63a5\u4e2d" : T.connectSsh}
          </button>
          <button disabled={!selectedDevice || isBusy} onClick={() => void testSelectedDevice()}>
            {isTesting ? "\u6d4b\u8bd5\u4e2d" : T.test}
          </button>
          <button disabled={!selectedDevice || isBusy} onClick={() => selectedDevice && setFileDevice(selectedDevice)}>
            {T.file}
          </button>
          <button disabled={!selectedDevice || isBusy} onClick={() => selectedDevice && setDesktopDevice(selectedDevice)}>
            {T.desktop}
          </button>
          <button disabled={!selectedDevice || isBusy} onClick={() => setEditing(selectedDevice ?? null)}>
            {T.edit}
          </button>
          <button className="danger" disabled={!selectedDevice || isBusy} onClick={() => void deleteSelectedDevice()}>
            {T.delete}
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{T.workspace}</h2>
            <p>{status}</p>
          </div>
          <div className="quick-actions">
            <button disabled={isBusy} onClick={() => void openLocal("powershell")}>
              PowerShell
            </button>
            <button disabled={isBusy} onClick={() => void openLocal("cmd")}>
              CMD
            </button>
            <button disabled={!selectedDevice || isBusy} onClick={() => openSsh(selectedDevice)}>
              {isConnecting ? "\u8fde\u63a5\u4e2d" : "SSH"}
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>{T.close}</button>
          </div>
        )}

        <TerminalPane
          tabs={tabs}
          activeTabId={activeTabId}
          setActiveTabId={setActiveTabId}
          closeTab={closeTab}
        />
      </section>

      {editing && (
        <DeviceEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onSave={(draft) => void saveDevice(draft)}
        />
      )}

      {fileDevice && (
        <FileTransferModal
          device={fileDevice}
          onClose={() => setFileDevice(null)}
        />
      )}

      {desktopDevice && (
        <RemoteDesktopModal
          device={desktopDevice}
          onClose={() => setDesktopDevice(null)}
        />
      )}

      {passwordDevice && (
        <PasswordPrompt
          device={passwordDevice}
          busy={connectingDeviceId === passwordDevice.id}
          onCancel={() => {
            setPasswordDevice(null);
            setStatus(T.cancelled);
          }}
          onSubmit={(password) => {
            const device = passwordDevice;
            setPasswordDevice(null);
            void connectSsh(device, password);
          }}
        />
      )}
    </main>
  );
}
