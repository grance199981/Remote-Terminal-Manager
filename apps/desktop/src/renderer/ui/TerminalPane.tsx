import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export interface TerminalTab {
  id: string;
  title: string;
  kind: "ssh" | "local";
  status: "connected" | "closed";
}

interface TerminalPaneProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  setActiveTabId(id: string): void;
  closeTab(id: string): void;
}

const TEXT = {
  emptyIcon: "TERM",
  emptyTitle: "\u6253\u5f00\u4e00\u4e2a\u7ec8\u7aef\u5f00\u59cb",
  emptyHint: "\u4ece\u53f3\u4e0a\u89d2\u542f\u52a8\u672c\u673a PowerShell / CMD\uff0c\u6216\u4ece\u5de6\u4fa7\u8bbe\u5907\u5217\u8868\u8fde\u63a5 SSH\u3002",
  started: "\u5df2\u542f\u52a8\u3002",
  disconnected: "\u5df2\u65ad\u5f00",
  error: "\u9519\u8bef",
  connectionFailed: "\u8fde\u63a5\u5931\u8d25"
};

export function TerminalPane({ tabs, activeTabId, setActiveTabId, closeTab }: TerminalPaneProps) {
  if (tabs.length === 0) {
    return (
      <div className="terminal-empty">
        <div className="terminal-empty-icon text-icon">{TEXT.emptyIcon}</div>
        <h3>{TEXT.emptyTitle}</h3>
        <p>{TEXT.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <div className="tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTabId === tab.id ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className={`dot ${tab.kind}`} />
            <span>{tab.title}</span>
            <span
              className="tab-close"
              title="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              X
            </span>
          </button>
        ))}
      </div>
      <div className="terminal-stage">
        {tabs.map((tab) => (
          <TerminalView key={tab.id} tab={tab} active={activeTabId === tab.id} />
        ))}
      </div>
    </div>
  );
}

function TerminalView({ tab, active }: { tab: TerminalTab; active: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      allowProposedApi: false,
      fontFamily: '\"JetBrains Mono\", \"Cascadia Mono\", \"Consolas\", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      theme: {
        background: "#080d18",
        foreground: "#d8e2f2",
        cursor: "#8bd3ff",
        black: "#101828",
        red: "#ff6b7a",
        green: "#8be28b",
        yellow: "#ffd166",
        blue: "#7aa2ff",
        magenta: "#c792ea",
        cyan: "#73daca",
        white: "#e6edf7"
      }
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);

    const safeFit = () => {
      const el = containerRef.current;
      if (!el || !activeRef.current || el.clientWidth <= 0 || el.clientHeight <= 0) return;
      try {
        fit.fit();
        window.remoteTerminal.terminals.resize({
          id: tab.id,
          cols: terminal.cols,
          rows: terminal.rows
        });
      } catch (error) {
        console.debug("xterm fit skipped", error);
      }
    };

    requestAnimationFrame(safeFit);
    terminal.writeln(`\x1b[36m${tab.title}\x1b[0m ${TEXT.started}`);
    terminal.onData((data) => window.remoteTerminal.terminals.input(tab.id, data));

    const copySelection = async () => {
      const selection = terminal.getSelection();
      if (selection) await window.remoteTerminal.clipboard.writeText(selection);
    };
    const pasteClipboard = async () => {
      const text = await window.remoteTerminal.clipboard.readText();
      if (text) window.remoteTerminal.terminals.input(tab.id, text);
    };
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "c" && terminal.hasSelection()) {
        void copySelection();
        return false;
      }
      if ((modifier && event.key.toLowerCase() === "v") || (event.shiftKey && event.key === "Insert")) {
        void pasteClipboard();
        return false;
      }
      return true;
    });
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (terminal.hasSelection()) void copySelection();
      else void pasteClipboard();
    };
    containerRef.current.addEventListener("contextmenu", handleContextMenu);

    const unsubscribeData = window.remoteTerminal.terminals.onData((event) => {
      if (event.id === tab.id) terminal.write(event.data);
    });
    const unsubscribeExit = window.remoteTerminal.terminals.onExit((event) => {
      if (event.id === tab.id) terminal.writeln(`\r\n\x1b[33m[${TEXT.disconnected}] ${event.message ?? ""}\x1b[0m`);
    });
    const unsubscribeError = window.remoteTerminal.terminals.onError((event) => {
      if (event.id === tab.id) terminal.writeln(`\r\n\x1b[31m[${TEXT.error}] ${event.message ?? TEXT.connectionFailed}\x1b[0m`);
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(safeFit);
    });
    resizeObserver.observe(containerRef.current);

    terminalRef.current = terminal;
    fitRef.current = fit;

    return () => {
      resizeObserver.disconnect();
      containerRef.current?.removeEventListener("contextmenu", handleContextMenu);
      unsubscribeData();
      unsubscribeExit();
      unsubscribeError();
      terminal.dispose();
    };
  }, [tab.id, tab.title]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) return;
      try {
        fitRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          window.remoteTerminal.terminals.resize({ id: tab.id, cols: terminal.cols, rows: terminal.rows });
          terminal.focus();
        }
      } catch (error) {
        console.debug("xterm activation fit skipped", error);
      }
    });
  }, [active, tab.id]);

  return <div ref={containerRef} className={`terminal-view ${active ? "active" : ""}`} />;
}
