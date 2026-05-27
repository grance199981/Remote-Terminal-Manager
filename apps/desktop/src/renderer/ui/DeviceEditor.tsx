import { useState } from "react";
import type { AuthType, DeviceDraft } from "../../shared/types";

interface DeviceEditorProps {
  value: DeviceDraft;
  onCancel(): void;
  onSave(value: DeviceDraft): void;
}

export function DeviceEditor({ value, onCancel, onSave }: DeviceEditorProps) {
  const [draft, setDraft] = useState<DeviceDraft>({
    ...value,
    port: value.port ?? 22,
    authType: value.authType ?? "password"
  });

  function update(patch: Partial<DeviceDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="modal-backdrop">
      <form
        className="device-editor"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <div className="modal-header">
          <div>
            <h2>{draft.id ? "编辑设备" : "新增 SSH 设备"}</h2>
            <p>密码不会保存；私钥只保存本地文件路径。</p>
          </div>
          <button type="button" className="ghost" onClick={onCancel}>
            ×
          </button>
        </div>

        <label>
          设备名称
          <input value={draft.name} onChange={(event) => update({ name: event.target.value })} required />
        </label>

        <div className="form-grid">
          <label>
            主机地址
            <input
              value={draft.host ?? ""}
              onChange={(event) => update({ host: event.target.value })}
              placeholder="192.168.1.10 / example.com"
              required
            />
          </label>
          <label>
            端口
            <input
              type="number"
              min={1}
              max={65535}
              value={draft.port ?? 22}
              onChange={(event) => update({ port: Number(event.target.value) })}
              required
            />
          </label>
        </div>

        <label>
          用户名
          <input value={draft.username ?? ""} onChange={(event) => update({ username: event.target.value })} required />
        </label>

        <label>
          认证方式
          <select
            value={draft.authType ?? "password"}
            onChange={(event) => update({ authType: event.target.value as AuthType })}
          >
            <option value="password">密码登录（连接时输入，不保存）</option>
            <option value="privateKey">私钥登录</option>
          </select>
        </label>

        {draft.authType === "privateKey" && (
          <label>
            私钥路径
            <input
              value={draft.privateKeyPath ?? ""}
              onChange={(event) => update({ privateKeyPath: event.target.value })}
              placeholder="C:\\Users\\you\\.ssh\\id_ed25519"
              required
            />
          </label>
        )}

        <label>
          标签（逗号分隔）
          <input
            value={draft.tags?.join(", ") ?? ""}
            onChange={(event) =>
              update({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })
            }
            placeholder="lab, gpu, nas"
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            取消
          </button>
          <button type="submit">保存设备</button>
        </div>
      </form>
    </div>
  );
}
