/**
 * Unit tests for ClamavPassthrough against an in-process mock clamd server.
 * No docker/clamav container required.
 */
import { once } from "node:events";
import { PassThrough, pipeline, Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClamavPassthrough } from "../../../utils/clamav/passthrough.js";
import { MockClamdServer } from "./mockClamdServer.js";

const EICAR_TEST_STRING =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

function collectScanComplete(
  passthrough: ClamavPassthrough,
): Promise<{ isInfected: boolean; failed: boolean; viruses: string[] }> {
  return new Promise((resolve, reject) => {
    passthrough.once("scan-complete", resolve);
    passthrough.once("error", reject);
  });
}

describe("ClamavPassthrough (mock clamd)", () => {
  let server: MockClamdServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  const startServer = async (
    options: ConstructorParameters<typeof MockClamdServer>[0],
  ) => {
    server = new MockClamdServer(options);
    const port = await server.start();
    return { host: "127.0.0.1", port };
  };

  it("passes clean data through and reports isInfected=false", async () => {
    const opts = await startServer({ behavior: { type: "ok" } });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);

    const chunks: Buffer[] = [];
    passthrough.on("data", (chunk) => chunks.push(chunk));

    Readable.from([Buffer.from("clean content")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.isInfected).toBe(false);
    expect(result.failed).toBe(false);
    expect(result.viruses).toEqual([]);
    expect(Buffer.concat(chunks).toString()).toBe("clean content");
    expect(server?.commandReceived).toBe(true);
  });

  it("reports infected files with virus names", async () => {
    const opts = await startServer({
      behavior: { type: "found", virus: "Eicar-Test-Signature" },
    });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from(EICAR_TEST_STRING)]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.isInfected).toBe(true);
    expect(result.viruses).toEqual(["Eicar-Test-Signature"]);
  });

  it("reports a clamd ERROR response as a failed scan, not a clean one", async () => {
    const opts = await startServer({
      behavior: { type: "error", message: "Size limit exceeded" },
    });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from("data")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.isInfected).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.viruses).toEqual([]);
  });

  it("treats an unexpected response as a failed scan", async () => {
    const opts = await startServer({
      behavior: { type: "custom", response: "garbage\n" },
    });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from("data")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.failed).toBe(true);
  });

  it("settles on scan timeout when clamd never responds", async () => {
    const opts = await startServer({ behavior: { type: "timeout" } });
    const passthrough = new ClamavPassthrough({ ...opts, scanTimeout: 50 });
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from("data")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.failed).toBe(true);
  });

  it("settles when clamd disconnects mid-stream", async () => {
    const opts = await startServer({ behavior: { type: "disconnect" } });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from("data")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.failed).toBe(true);
  });

  it("settles with a connection error when nothing is listening", async () => {
    // Grab a free port, then close it so the connection is refused.
    const probe = new MockClamdServer({ behavior: { type: "ok" } });
    const port = await probe.start();
    await probe.stop();

    const passthrough = new ClamavPassthrough({ host: "127.0.0.1", port });
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from("data")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.failed).toBe(true);
  });

  it("settles on connection timeout", async () => {
    // 192.0.2.0/24 (TEST-NET-1) is reserved and unroutable.
    const passthrough = new ClamavPassthrough({
      host: "192.0.2.1",
      port: 3310,
      connectionTimeout: 50,
    });
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([Buffer.from("data")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.failed).toBe(true);
  });

  it("splits large payloads into protocol chunks of chunkSize", async () => {
    const opts = await startServer({ behavior: { type: "ok" } });
    const chunkSize = 1024;
    const payload = Buffer.alloc(chunkSize * 3 + 100, "a");
    const passthrough = new ClamavPassthrough({ ...opts, chunkSize });
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    Readable.from([payload]).pipe(passthrough);

    await scanPromise;
    const received = server?.receivedChunks ?? [];
    expect(received.length).toBe(4);
    expect(received.slice(0, 3).every((c) => c.length === chunkSize)).toBe(
      true,
    );
    expect(received[3].length).toBe(100);
    expect(Buffer.concat(received.map((c) => c.data)).equals(payload)).toBe(
      true,
    );
  });

  it("supports scan-only mode without emitting readable chunks", async () => {
    const opts = await startServer({ behavior: { type: "ok" } });
    const passthrough = new ClamavPassthrough(opts, { emitReadable: false });
    const scanPromise = collectScanComplete(passthrough);
    const onData = vi.fn();
    passthrough.on("data", onData);

    Readable.from([Buffer.from("clean content")]).pipe(passthrough);

    const result = await scanPromise;
    expect(result.isInfected).toBe(false);
    expect(onData).not.toHaveBeenCalled();
  });

  it("works in a pipeline with downstream consumers", async () => {
    const opts = await startServer({ behavior: { type: "ok" } });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);
    const output = new PassThrough();

    const outputChunks: Buffer[] = [];
    output.on("data", (chunk) => outputChunks.push(chunk));

    const content = "Safe content for pipeline test";
    await new Promise<void>((resolve, reject) => {
      pipeline(
        Readable.from([Buffer.from(content)]),
        passthrough,
        output,
        (err) => (err ? reject(err) : resolve()),
      );
    });

    const result = await scanPromise;
    expect(result.isInfected).toBe(false);
    expect(Buffer.concat(outputChunks).toString()).toBe(content);
  });

  it("destroys itself after the scan settles", async () => {
    const opts = await startServer({ behavior: { type: "disconnect" } });
    const passthrough = new ClamavPassthrough(opts);
    const scanPromise = collectScanComplete(passthrough);

    const chunks: Buffer[] = [];
    passthrough.on("data", (chunk) => chunks.push(chunk));

    passthrough.write(Buffer.from("first"));
    await scanPromise;

    expect(Buffer.concat(chunks).toString()).toBe("first");
    expect(passthrough.destroyed).toBe(true);
  });

  it("cleans up the socket and timers on destroy", async () => {
    const opts = await startServer({ behavior: { type: "timeout" } });
    const passthrough = new ClamavPassthrough({ ...opts, scanTimeout: 60000 });
    const scanPromise = collectScanComplete(passthrough);
    passthrough.resume();

    passthrough.write(Buffer.from("data"));
    passthrough.end();
    await once(passthrough, "finish");
    passthrough.destroy();

    const result = await scanPromise;
    expect(result.isInfected).toBe(false);
  });
});
