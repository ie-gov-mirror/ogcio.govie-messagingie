import { Socket } from "node:net";
import { Transform, type TransformCallback } from "node:stream";
import type {
  ClamavPassthroughOptions,
  ClamavScannerOptions,
  ClamavScanResult,
} from "./types.js";

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const DEFAULT_HIGH_WATER_MARK = 4;
const DEFAULT_CONNECTION_TIMEOUT = 5_000;
const DEFAULT_SCAN_TIMEOUT = 120_000;
const INSTREAM_COMMAND = Buffer.from("zINSTREAM\0");
const ZERO_LENGTH_TERMINATOR = Buffer.alloc(4, 0);

function parseResponse(response: string): ClamavScanResult {
  const trimmed = response.replace(/\0/g, "").trim();

  if (trimmed.endsWith("OK")) {
    return { status: "valid", message: "File is clean" };
  }

  const foundMatch = trimmed.match(/^stream:\s*(.+)\s+FOUND$/i);
  if (foundMatch) {
    const viruses = foundMatch[1].split(",").map((v) => v.trim());
    return {
      status: "infected",
      message: `Virus detected: ${viruses.join(", ")}`,
      viruses,
    };
  }

  const errorMatch = trimmed.match(/^stream:\s*(.+)\s+ERROR$/i);
  if (errorMatch) {
    return { status: "failed", message: `ClamAV error: ${errorMatch[1]}` };
  }

  return {
    status: "failed",
    message: `Unexpected ClamAV response: ${trimmed}`,
  };
}

export class ClamavPassthrough extends Transform {
  private socket: Socket | null = null;
  private chunkSize: number;
  private connectionTimeout: number;
  private scanTimeout: number;
  private host: string;
  private port: number;
  private emitReadable: boolean;
  private responseData = "";
  private scanTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private settled = false;
  private failed = false;

  constructor(
    options: ClamavScannerOptions,
    passthroughOptions: ClamavPassthroughOptions = {},
  ) {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const highWaterMark =
      (options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK) * chunkSize;

    super({ highWaterMark, autoDestroy: false });

    this.chunkSize = chunkSize;
    this.connectionTimeout =
      options.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT;
    this.scanTimeout = options.scanTimeout ?? DEFAULT_SCAN_TIMEOUT;
    this.host = options.host;
    this.port = options.port;
    this.emitReadable = passthroughOptions.emitReadable ?? true;
  }

  private settle(result: ClamavScanResult): void {
    if (this.settled) return;
    this.settled = true;
    this.failed = result.status === "failed";
    this.clearScanTimeout();

    const isInfected = result.status === "infected";
    const viruses = result.viruses ?? [];
    this.emit("scan-complete", { isInfected, failed: this.failed, viruses });

    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }

    // With autoDestroy disabled, we must destroy ourselves after settling.
    if (!this.destroyed) {
      this.destroy();
    }
  }

  private clearScanTimeout(): void {
    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer);
      this.scanTimeoutTimer = null;
    }
  }

  private startScanTimeout(): void {
    this.scanTimeoutTimer = setTimeout(() => {
      this.settle({ status: "failed", message: "Scan timeout exceeded" });
      this.socket?.destroy();
    }, this.scanTimeout);
  }

  _construct(callback: (error?: Error | null) => void): void {
    const socket = new Socket();
    this.socket = socket;

    const connectionTimer = setTimeout(() => {
      socket.destroy();
      this.settle({ status: "failed", message: "Connection timeout" });
      callback();
    }, this.connectionTimeout);

    socket.once("error", (err) => {
      clearTimeout(connectionTimer);
      this.settle({
        status: "failed",
        message: `Connection error: ${err.message}`,
      });
      callback();
    });

    socket.connect(this.port, this.host, () => {
      clearTimeout(connectionTimer);
      socket.removeAllListeners("error");

      let socketError: Error | null = null;

      socket.on("error", (err) => {
        socketError = err;
      });

      socket.on("data", (data) => {
        this.responseData += data.toString();
      });

      socket.on("end", () => {
        socket.end();
      });

      socket.on("close", () => {
        if (this.responseData) {
          this.settle(parseResponse(this.responseData));
        } else if (socketError) {
          this.settle({
            status: "failed",
            message: `Socket error: ${socketError.message}`,
          });
        } else if (!this.settled) {
          this.settle({
            status: "failed",
            message: "Connection closed before receiving response",
          });
        }
      });

      socket.write(INSTREAM_COMMAND, (err) => {
        if (err) {
          this.settle({
            status: "failed",
            message: `Failed to send command: ${err.message}`,
          });
        }
        callback();
      });
    });
  }

  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    if (this.emitReadable) {
      this.push(chunk);
    }

    if (this.failed || !this.socket || this.socket.destroyed) {
      callback();
      return;
    }

    this.writeChunked(chunk, 0, callback);
  }

  private writeChunked(
    data: Buffer,
    offset: number,
    callback: TransformCallback,
  ): void {
    if (offset >= data.length) {
      callback();
      return;
    }

    const end = Math.min(offset + this.chunkSize, data.length);
    const slice = data.subarray(offset, end);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(slice.length, 0);

    const frame = Buffer.concat([header, slice]);
    const canContinue = this.socket?.write(frame, (err) => {
      if (err) {
        callback();
        return;
      }
      if (canContinue) {
        this.writeChunked(data, end, callback);
      }
    });

    if (!canContinue) {
      this.socket?.once("drain", () => {
        this.writeChunked(data, end, callback);
      });
    }
  }

  _flush(callback: TransformCallback): void {
    if (this.failed || this.settled || !this.socket || this.socket.destroyed) {
      callback();
      return;
    }

    this.startScanTimeout();

    this.socket.write(ZERO_LENGTH_TERMINATOR, () => {
      // Write errors are handled by the socket error/close handlers.
      callback();
    });
  }

  _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void,
  ): void {
    this.clearScanTimeout();
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    super._destroy(error, callback);
  }
}
