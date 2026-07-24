import type {
  Device,
  DeviceConnectionTestResult,
  DeviceDraft,
  FileListResponse,
  LocalListRequest,
  LocalPathRequest,
  OperationResult,
  RemoteDesktopConfig,
  RemoteDesktopStartResult,
  RemoteDesktopStatus,
  SftpListRequest,
  SftpPathRequest,
  SftpProgressEvent,
  SftpTransferRequest,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalResizeRequest
} from "./shared/types";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: boolean;
      };
    }
  }

  interface Window {
    remoteTerminal: {
      clipboard: {
        readText(): Promise<string>;
        writeText(text: string): Promise<void>;
      };
      devices: {
        list(): Promise<Device[]>;
        save(device: DeviceDraft): Promise<Device>;
        delete(id: string): Promise<void>;
        test(id: string): Promise<DeviceConnectionTestResult>;
      };
      files: {
        listLocal(request: LocalListRequest): Promise<FileListResponse>;
        deleteLocal(request: LocalPathRequest): Promise<OperationResult>;
        listRemote(request: SftpListRequest): Promise<FileListResponse>;
        upload(request: SftpTransferRequest): Promise<OperationResult>;
        download(request: SftpTransferRequest): Promise<OperationResult>;
        mkdir(request: SftpPathRequest): Promise<OperationResult>;
        deleteRemote(request: SftpPathRequest): Promise<OperationResult>;
        onProgress(callback: (event: SftpProgressEvent) => void): () => void;
      };
      desktop: {
        test(request: RemoteDesktopConfig): Promise<RemoteDesktopStatus>;
        start(request: RemoteDesktopConfig): Promise<RemoteDesktopStartResult>;
        install(request: RemoteDesktopConfig): Promise<RemoteDesktopStartResult>;
        tunnel(request: RemoteDesktopConfig): Promise<RemoteDesktopStartResult>;
        openClient(request: RemoteDesktopConfig): Promise<OperationResult>;
      };
      terminals: {
        create(request: TerminalCreateRequest): Promise<TerminalCreateResponse>;
        input(id: string, data: string): void;
        resize(request: TerminalResizeRequest): void;
        close(id: string): void;
        onData(callback: (event: TerminalDataEvent) => void): () => void;
        onExit(callback: (event: TerminalExitEvent) => void): () => void;
        onError(callback: (event: TerminalExitEvent) => void): () => void;
      };
    };
  }
}

export {};
