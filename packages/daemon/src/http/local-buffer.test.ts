import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalBuffer } from './local-buffer.js';
import type { IngestPayload } from '../parser/message-types.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

function makeTempDbPath(): string {
  return join(tmpdir(), `csl-buffer-test-${randomUUID()}.db`);
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

describe('LocalBuffer', () => {
  let buffer: LocalBuffer;
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeTempDbPath();
    buffer = new LocalBuffer(dbPath);
    buffer.init();
  });

  afterEach(() => {
    try {
      buffer.close();
      unlinkSync(dbPath);
    } catch {
      // ignore cleanup errors
    }
  });

  it('init() creates table', () => {
    // If init didn't work, count() would throw
    expect(buffer.count()).toBe(0);
  });

  it('add() stores payload', () => {
    buffer.add(makePayload());
    expect(buffer.count()).toBe(1);
  });

  it('getAll() returns payloads in FIFO order', () => {
    buffer.add(makePayload({ fileOffset: 100 }));
    buffer.add(makePayload({ fileOffset: 200 }));
    buffer.add(makePayload({ fileOffset: 300 }));

    const all = buffer.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].payload.fileOffset).toBe(100);
    expect(all[1].payload.fileOffset).toBe(200);
    expect(all[2].payload.fileOffset).toBe(300);
    expect(all[0].id).toBeLessThan(all[1].id);
    expect(all[1].id).toBeLessThan(all[2].id);
  });

  it('remove() deletes specific payload', () => {
    buffer.add(makePayload({ fileOffset: 1 }));
    buffer.add(makePayload({ fileOffset: 2 }));

    const all = buffer.getAll();
    buffer.remove(all[0].id);

    const remaining = buffer.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.fileOffset).toBe(2);
  });

  it('count() returns correct count', () => {
    expect(buffer.count()).toBe(0);
    buffer.add(makePayload());
    expect(buffer.count()).toBe(1);
    buffer.add(makePayload());
    expect(buffer.count()).toBe(2);
  });

  it('multiple add/remove operations', () => {
    buffer.add(makePayload({ fileOffset: 10 }));
    buffer.add(makePayload({ fileOffset: 20 }));
    buffer.add(makePayload({ fileOffset: 30 }));

    const all = buffer.getAll();
    buffer.remove(all[1].id); // remove middle

    expect(buffer.count()).toBe(2);
    const remaining = buffer.getAll();
    expect(remaining[0].payload.fileOffset).toBe(10);
    expect(remaining[1].payload.fileOffset).toBe(30);
  });

  it('close and reopen preserves data', () => {
    buffer.add(makePayload({ fileOffset: 42 }));
    buffer.close();

    const buffer2 = new LocalBuffer(dbPath);
    buffer2.init();

    expect(buffer2.count()).toBe(1);
    const all = buffer2.getAll();
    expect(all[0].payload.fileOffset).toBe(42);

    buffer2.close();
    // Reassign so afterEach doesn't double-close
    buffer = new LocalBuffer(dbPath);
    buffer.init();
  });
});
