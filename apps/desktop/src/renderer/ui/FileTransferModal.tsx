import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Device, FileEntry, FileListResponse, SftpProgressEvent } from "../../shared/types";

const UI = {
  titlePrefix: "\u6587\u4ef6\u4f20\u8f93",
  passwordLabel: "SFTP/SSH \u5bc6\u7801",
  passwordPlaceholder: "\u8f93\u5165\u5bc6\u7801\u540e\u8f7d\u5165\u8fdc\u7a0b\u6587\u4ef6",
  loadRemoteFiles: "\u8f7d\u5165\u8fdc\u7a0b\u6587\u4ef6",
  upload: "\u4e0a\u4f20\u6240\u9009",
  download: "\u4e0b\u8f7d\u6240\u9009",
  mkdir: "\u8fdc\u7a0b\u65b0\u5efa\u6587\u4ef6\u5939",
  deleteLocal: "\u5220\u9664\u672c\u673a\u9879",
  deleteRemote: "\u5220\u9664\u8fdc\u7a0b\u9879",
  local: "\u672c\u673a",
  remote: "\u8fdc\u7a0b",
  refresh: "\u5237\u65b0",
  parentFolder: "\u4e0a\u7ea7\u76ee\u5f55",
  openSelectedFolder: "\u6253\u5f00\u6240\u9009\u76ee\u5f55",
  transferHint: "\u53cc\u51fb\u76ee\u5f55\u6216\u4f7f\u7528\u6253\u5f00\u6240\u9009\u76ee\u5f55\u8fdb\u5165\uff1b\u4f20\u8f93\u9047\u5230\u540c\u540d\u76ee\u6807\u65f6\u5fc5\u987b\u786e\u8ba4\u8986\u76d6\u3002",
  loadedRemote: "\u5df2\u8f7d\u5165\u8fdc\u7a0b\u76ee\u5f55",
  drives: "\u76d8\u7b26",
  uploaded: "\u4e0a\u4f20\u5b8c\u6210",
  downloaded: "\u4e0b\u8f7d\u5b8c\u6210",
  mkdirPrompt: "\u8f93\u5165\u8fdc\u7a0b\u6587\u4ef6\u5939\u540d\u79f0",
  deleteConfirmPrefix: "\u786e\u5b9a\u5220\u9664\u8fdc\u7a0b\u9879",
  deleteLocalConfirmPrefix: "\u786e\u5b9a\u5220\u9664\u672c\u673a\u9879",
  deleteConfirmSuffix: "\u6587\u4ef6\u5939\u5c06\u88ab\u9012\u5f52\u6c38\u4e45\u5220\u9664\uff0c\u65e0\u6cd5\u64a4\u9500\u3002"
};

interface FileTransferModalProps {
  device: Device;
  onClose(): void;
}

export function FileTransferModal({ device, onClose }: FileTransferModalProps) {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(device.authType !== "password");
  const [localPath, setLocalPath] = useState("");
  // Start from the SFTP working directory. It is portable across chrooted servers.
  const [remotePath, setRemotePath] = useState(".");
  const [localList, setLocalList] = useState<FileListResponse | null>(null);
  const [remoteList, setRemoteList] = useState<FileListResponse | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<FileEntry | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<FileEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const auth = useMemo(() => ({ deviceId: device.id, password: password || undefined }), [device.id, password]);

  useEffect(() => {
    void loadLocal(localPath || undefined);
  }, []);

  useEffect(() => {
    if (authenticated) void loadRemote(remotePath);
  }, [authenticated]);

  useEffect(() => window.remoteTerminal.files.onProgress((progress: SftpProgressEvent) => {
    if (progress.deviceId !== device.id || progress.direction !== "upload") return;
    const percent = progress.totalBytes > 0 ? Math.floor((progress.transferredBytes / progress.totalBytes) * 100) : 0;
    setMessage(`\u6b63\u5728\u4e0a\u4f20 (${progress.completedFiles} \u4e2a\u6587\u4ef6\u5df2\u5b8c\u6210): ${progress.path} ${percent}%`);
  }), [device.id]);

  async function loadLocal(nextPath?: string) {
    try {
      setError(null);
      const list = await window.remoteTerminal.files.listLocal({ path: nextPath });
      setLocalList(list);
      setLocalPath(list.path);
      setSelectedLocal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadRemote(nextPath: string, announce = true) {
    try {
      setError(null);
      setBusy(true);
      const list = await window.remoteTerminal.files.listRemote({ ...auth, path: nextPath });
      setRemoteList(list);
      setRemotePath(list.path);
      setSelectedRemote(null);
      if (announce) setMessage(`${UI.loadedRemote}: ${list.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setAuthenticated(true);
  }

  async function uploadSelected() {
    if (!selectedLocal || selectedLocal.type === "other") return;
    const target = joinRemote(remotePath, selectedLocal.name);
    try {
      setBusy(true);
      setError(null);
      setMessage(`\u6b63\u5728\u4e0a\u4f20: ${selectedLocal.path} -> ${target}`);
      let result = await window.remoteTerminal.files.upload({ ...auth, localPath: selectedLocal.path, remotePath: target });
      if (result.conflict) {
        const kind = selectedLocal.type === "directory"
          ? "\u5c06\u5408\u5e76\u76ee\u5f55\uff0c\u4e14\u540c\u540d\u6587\u4ef6\u4f1a\u88ab\u8986\u76d6"
          : "\u5c06\u8986\u76d6\u76ee\u6807\u6587\u4ef6";
        if (!confirm(`\u8fdc\u7a0b\u76ee\u6807\u5df2\u5b58\u5728: ${target}\n${kind}\n\n\u662f\u5426\u7ee7\u7eed?`)) {
          setMessage(`\u5df2\u53d6\u6d88\u4e0a\u4f20: ${selectedLocal.name}`);
          return;
        }
        setMessage(`\u6b63\u5728\u8986\u76d6\u4e0a\u4f20: ${selectedLocal.path} -> ${target}`);
        result = await window.remoteTerminal.files.upload({ ...auth, localPath: selectedLocal.path, remotePath: target, overwrite: true });
      }
      if (!result.ok) throw new Error(result.message);
      setMessage(`\u4e0a\u4f20\u6210\u529f: ${result.message}`);
      await loadRemote(remotePath, false);
    } catch (err) {
      setError(`\u4e0a\u4f20\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSelected() {
    if (!selectedRemote || selectedRemote.type === "other") return;
    const target = joinLocal(localPath, selectedRemote.name);
    try {
      setBusy(true);
      setError(null);
      setMessage(`\u6b63\u5728\u4e0b\u8f7d: ${selectedRemote.path} -> ${target}`);
      let result = await window.remoteTerminal.files.download({ ...auth, localPath: target, remotePath: selectedRemote.path });
      if (result.conflict) {
        const kind = selectedRemote.type === "directory"
          ? "\u5c06\u5408\u5e76\u76ee\u5f55\uff0c\u4e14\u540c\u540d\u6587\u4ef6\u4f1a\u88ab\u8986\u76d6"
          : "\u5c06\u8986\u76d6\u672c\u673a\u6587\u4ef6";
        if (!confirm(`\u672c\u673a\u76ee\u6807\u5df2\u5b58\u5728: ${target}\n${kind}\n\n\u662f\u5426\u7ee7\u7eed?`)) {
          setMessage(`\u5df2\u53d6\u6d88\u4e0b\u8f7d: ${selectedRemote.name}`);
          return;
        }
        setMessage(`\u6b63\u5728\u8986\u76d6\u4e0b\u8f7d: ${selectedRemote.path} -> ${target}`);
        result = await window.remoteTerminal.files.download({ ...auth, localPath: target, remotePath: selectedRemote.path, overwrite: true });
      }
      if (!result.ok) throw new Error(result.message);
      setMessage(`\u4e0b\u8f7d\u6210\u529f: ${result.message}`);
      await loadLocal(localPath);
    } catch (err) {
      setError(`\u4e0b\u8f7d\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }
  async function makeRemoteDir() {
    const name = prompt(UI.mkdirPrompt);
    if (!name) return;
    try {
      setBusy(true);
      setError(null);
      await window.remoteTerminal.files.mkdir({ ...auth, path: joinRemote(remotePath, name) });
      await loadRemote(remotePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedLocal() {
    if (!selectedLocal) return;
    if (!confirm(`${UI.deleteLocalConfirmPrefix}: ${selectedLocal.name}? ${UI.deleteConfirmSuffix}`)) return;
    try {
      setBusy(true);
      setError(null);
      const result = await window.remoteTerminal.files.deleteLocal({ path: selectedLocal.path });
      setMessage(`\u672c\u673a\u5220\u9664\u6210\u529f: ${result.message}`);
      await loadLocal(localPath);
    } catch (err) {
      setError(`\u672c\u673a\u5220\u9664\u5931\u8d25: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedRemote() {
    if (!selectedRemote) return;
    if (!confirm(`${UI.deleteConfirmPrefix}: ${selectedRemote.name}? ${UI.deleteConfirmSuffix}`)) return;
    try {
      setBusy(true);
      setError(null);
      const result = await window.remoteTerminal.files.deleteRemote({ ...auth, path: selectedRemote.path });
      setMessage(`\u8fdc\u7a0b\u5220\u9664\u6210\u529f: ${result.message}`);
      await loadRemote(remotePath, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop file-transfer-backdrop">
      <section className="file-transfer-modal">
        <header className="modal-header">
          <div>
            <h2>{UI.titlePrefix} - {device.name}</h2>
            <p>{device.username}@{device.host}:{device.port ?? 22}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>X</button>
        </header>

        {!authenticated ? (
          <form className="sftp-password" onSubmit={submitPassword}>
            <label>
              {UI.passwordLabel}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={UI.passwordPlaceholder}
                autoFocus
              />
            </label>
            <button type="submit" disabled={!password}>{UI.loadRemoteFiles}</button>
          </form>
        ) : (
          <>
            <div className="transfer-actions">
              <button onClick={() => void uploadSelected()} disabled={busy || !selectedLocal || selectedLocal.type === "other"}>{UI.upload}</button>
              <button onClick={() => void downloadSelected()} disabled={busy || !selectedRemote || selectedRemote.type === "other"}>{UI.download}</button>
              <button className="secondary" onClick={() => void makeRemoteDir()} disabled={busy}>{UI.mkdir}</button>
              <button className="danger" onClick={() => void deleteSelectedLocal()} disabled={busy || !selectedLocal}>{UI.deleteLocal}</button>
              <button className="danger" onClick={() => void deleteSelectedRemote()} disabled={busy || !selectedRemote}>{UI.deleteRemote}</button>
            </div>

            <p className="transfer-hint">{UI.transferHint}</p>

            <div className="file-panels">
              <FilePanel
                title={UI.local}
                pathValue={localPath}
                onPathChange={setLocalPath}
                onGo={() => void loadLocal(localPath)}
                onParent={() => localList?.parent && void loadLocal(localList.parent)}
                entries={localList?.entries ?? []}
                selected={selectedLocal}
                onSelect={setSelectedLocal}
                onOpen={(entry) => entry.type === "directory" && void loadLocal(entry.path)}
                roots={localList?.roots ?? []}
                onRoot={(root) => void loadLocal(root)}
              />
              <FilePanel
                title={UI.remote}
                pathValue={remotePath}
                onPathChange={setRemotePath}
                onGo={() => void loadRemote(remotePath)}
                onParent={() => remoteList?.parent && void loadRemote(remoteList.parent)}
                entries={remoteList?.entries ?? []}
                selected={selectedRemote}
                onSelect={setSelectedRemote}
                onOpen={(entry) => entry.type === "directory" && void loadRemote(entry.path)}
              />
            </div>
          </>
        )}

        {(message || error) && <div className={error ? "error-banner" : "transfer-message"}>{error ?? message}</div>}
      </section>
    </div>
  );
}

interface FilePanelProps {
  title: string;
  pathValue: string;
  onPathChange(value: string): void;
  onGo(): void;
  onParent(): void;
  entries: FileEntry[];
  selected: FileEntry | null;
  onSelect(entry: FileEntry): void;
  onOpen(entry: FileEntry): void;
  roots?: string[];
  onRoot?(root: string): void;
}

function FilePanel({
  title,
  pathValue,
  onPathChange,
  onGo,
  onParent,
  entries,
  selected,
  onSelect,
  onOpen,
  roots,
  onRoot
}: FilePanelProps) {
  return (
    <section className="file-panel">
      <div className="file-panel-title">{title}</div>
      {roots && roots.length > 0 && onRoot ? (
        <div className="rootbar" aria-label={UI.drives}>
          {roots.map((root) => (
            <button
              key={root}
              type="button"
              className={pathValue.toLowerCase().startsWith(root.toLowerCase()) ? "active" : ""}
              onClick={() => onRoot(root)}
            >
              {root}
            </button>
          ))}
        </div>
      ) : null}
      <div className="pathbar">
        <button className="secondary" onClick={onParent}>{UI.parentFolder}</button>
        <input value={pathValue} onChange={(event) => onPathChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onGo()} />
        <button className="secondary" onClick={() => selected?.type === "directory" && onOpen(selected)} disabled={selected?.type !== "directory"}>{UI.openSelectedFolder}</button>
        <button onClick={onGo}>{UI.refresh}</button>
      </div>
      <div className="file-list">
        {entries.map((entry) => (
          <button
            key={entry.path}
            className={`file-row ${selected?.path === entry.path ? "active" : ""}`}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onOpen(entry)}
          >
            <span className={`file-icon ${entry.type}`}>{entry.type === "directory" ? "DIR" : entry.type === "file" ? "FILE" : "ITEM"}</span>
            <span className="file-name">{entry.name}</span>
            <span className="file-size">{entry.type === "file" ? formatSize(entry.size) : ""}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function joinRemote(base: string, name: string) {
  return `${base.replace(/\/+$/, "")}/${name}`;
}

function joinLocal(base: string, name: string) {
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${sep}${name}`;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
