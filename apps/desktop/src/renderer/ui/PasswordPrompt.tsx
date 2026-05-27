import { FormEvent, useEffect, useRef, useState } from "react";
import type { Device } from "../../shared/types";

interface PasswordPromptProps {
  device: Device;
  busy: boolean;
  onCancel(): void;
  onSubmit(password: string): void;
}

export function PasswordPrompt({ device, busy, onCancel, onSubmit }: PasswordPromptProps) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    onSubmit(password);
  }

  return (
    <div className="modal-backdrop">
      <form className="device-editor password-dialog" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>输入 SSH 密码</h2>
            <p>
              正在连接 {device.username}@{device.host}:{device.port ?? 22}；密码只用于本次连接，不会保存。
            </p>
          </div>
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            ×
          </button>
        </div>

        <label>
          SSH 密码
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="输入密码后按 Enter 连接"
            disabled={busy}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="submit" disabled={!password || busy}>
            {busy ? "连接中..." : "连接"}
          </button>
        </div>
      </form>
    </div>
  );
}
