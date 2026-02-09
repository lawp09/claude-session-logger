import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IngestClient } from './ingest-client.js';
import { LocalBuffer } from './local-buffer.js';
import type { IngestPayload } from '../parser/message-types.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function makeTempDbPath(): string {
  return join(tmpdir(), `csl-ingest-test-${randomUUID()}.db`);
}

function makePayload(overrides?: Partial<IngestPayload>): IngestPayload {
  return {
    session: {
      sessionId: 'sess-1',
      projectPath: '/tmp/project',
      projectSlug: 'project',
      filePath: '/tmp/project/.claude/sessions/sess-1.jsonl',
    },
    messages: [],
    fileOffset: 0,
    ...overrides,
  };
}

const API_URL = 'https://csl.example.com/api/ingest';
const API_TOKEN = 'test-token-123';

describe('IngestClient', () => {
  let buffer: LocalBuffer;
  let client: IngestClient;
  let dbPath: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbPath = makeTempDbPath();
    buffer = new LocalBuffer(dbPath);
    buffer.init();

    client = new IngestClient({ apiUrl: API_URL, apiToken: API_TOKEN }, buffer);

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    client.stopRetryLoop();
    vi.restoreAllMocks();
    try {
      buffer.close();
      unlinkSync(dbPath);
    } catch {
      // ignore cleanup errors
    }
  });

  it('send() with successful API returns true', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await client.send(makePayload());

    expect(result).toBe(true);
    expect(buffer.count()).toBe(0);
  });

  it('send() with API error buffers payload and returns false', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await client.send(makePayload());

    expect(result).toBe(false);
    expect(buffer.count()).toBe(1);
  });

  it('send() with network error buffers payload and returns false', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await client.send(makePayload());

    expect(result).toBe(false);
    expect(buffer.count()).toBe(1);
  });

  it('flushBuffer() sends buffered payloads and removes them', async () => {
    buffer.add(makePayload({ fileOffset: 10 }));
    buffer.add(makePayload({ fileOffset: 20 }));

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const sent = await client.flushBuffer();

    expect(sent).toBe(2);
    expect(buffer.count()).toBe(0);
  });

  it('flushBuffer() with still-failing API keeps payloads in buffer', async () => {
    buffer.add(makePayload({ fileOffset: 10 }));
    buffer.add(makePayload({ fileOffset: 20 }));

    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const sent = await client.flushBuffer();

    expect(sent).toBe(0);
    expect(buffer.count()).toBe(2);
  });

  it('startRetryLoop/stopRetryLoop lifecycle', () => {
    vi.useFakeTimers();

    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    buffer.add(makePayload());

    client = new IngestClient(
      { apiUrl: API_URL, apiToken: API_TOKEN, retryIntervalMs: 1000 },
      buffer,
    );

    client.startRetryLoop();
    // Starting twice should be idempotent
    client.startRetryLoop();

    vi.advanceTimersByTime(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    client.stopRetryLoop();
    vi.advanceTimersByTime(5000);
    // No additional calls after stop
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('send() includes correct Authorization header', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    await client.send(makePayload());

    expect(fetchMock).toHaveBeenCalledWith(API_URL, expect.objectContaining({
      headers: expect.objectContaining({
        'Authorization': 'Bearer test-token-123',
      }),
    }));
  });

  it('send() sends JSON body correctly', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const payload = makePayload({ fileOffset: 999 });
    await client.send(payload);

    expect(fetchMock).toHaveBeenCalledWith(API_URL, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    }));
  });
});
