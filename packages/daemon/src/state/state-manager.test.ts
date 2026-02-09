import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateManager } from './state-manager.js';

describe('StateManager', () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'csl-state-test-'));
    stateFilePath = join(tempDir, 'state.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should load with no existing state file and have empty state', async () => {
    const sm = new StateManager(stateFilePath);
    await sm.load();
    expect(sm.getTrackedFiles()).toEqual([]);
  });

  it('should load with valid state file and restore offsets', async () => {
    const existing = {
      '/path/to/session.jsonl': { offset: 12345, lastUpdated: '2026-01-01T00:00:00.000Z' },
    };
    await writeFile(stateFilePath, JSON.stringify(existing), 'utf-8');

    const sm = new StateManager(stateFilePath);
    await sm.load();
    expect(sm.getOffset('/path/to/session.jsonl')).toBe(12345);
  });

  it('should load with corrupted state file and start fresh', async () => {
    await writeFile(stateFilePath, '{invalid json!!!', 'utf-8');

    const sm = new StateManager(stateFilePath);
    await sm.load();
    expect(sm.getTrackedFiles()).toEqual([]);
  });

  it('should return 0 for unknown file offset', async () => {
    const sm = new StateManager(stateFilePath);
    await sm.load();
    expect(sm.getOffset('/nonexistent/file.jsonl')).toBe(0);
  });

  it('should return set value after setOffset', async () => {
    const sm = new StateManager(stateFilePath);
    await sm.load();
    sm.setOffset('/some/file.jsonl', 9999);
    expect(sm.getOffset('/some/file.jsonl')).toBe(9999);
  });

  it('should write state to disk on flush', async () => {
    const sm = new StateManager(stateFilePath);
    await sm.load();
    sm.setOffset('/a.jsonl', 100);
    await sm.flush();

    const raw = await readFile(stateFilePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data['/a.jsonl'].offset).toBe(100);
    expect(data['/a.jsonl'].lastUpdated).toBeDefined();
  });

  it('should survive load → flush → load cycle', async () => {
    const sm1 = new StateManager(stateFilePath);
    await sm1.load();
    sm1.setOffset('/x.jsonl', 555);
    sm1.setOffset('/y.jsonl', 777);
    await sm1.flush();

    const sm2 = new StateManager(stateFilePath);
    await sm2.load();
    expect(sm2.getOffset('/x.jsonl')).toBe(555);
    expect(sm2.getOffset('/y.jsonl')).toBe(777);
  });

  it('should remove file tracking with removeFile', async () => {
    const sm = new StateManager(stateFilePath);
    await sm.load();
    sm.setOffset('/to-remove.jsonl', 42);
    expect(sm.getTrackedFiles()).toContain('/to-remove.jsonl');

    sm.removeFile('/to-remove.jsonl');
    expect(sm.getTrackedFiles()).not.toContain('/to-remove.jsonl');
    expect(sm.getOffset('/to-remove.jsonl')).toBe(0);
  });

  it('should return all tracked file paths', async () => {
    const sm = new StateManager(stateFilePath);
    await sm.load();
    sm.setOffset('/a.jsonl', 1);
    sm.setOffset('/b.jsonl', 2);
    sm.setOffset('/c.jsonl', 3);

    const tracked = sm.getTrackedFiles();
    expect(tracked).toHaveLength(3);
    expect(tracked).toContain('/a.jsonl');
    expect(tracked).toContain('/b.jsonl');
    expect(tracked).toContain('/c.jsonl');
  });

  it('should debounce multiple setOffset calls into single disk write', async () => {
    const sm = new StateManager(stateFilePath, { debounceMs: 50 });
    await sm.load();

    sm.setOffset('/a.jsonl', 1);
    sm.setOffset('/b.jsonl', 2);
    sm.setOffset('/c.jsonl', 3);

    // State file should not exist yet (debounce pending)
    let exists = true;
    try {
      await readFile(stateFilePath, 'utf-8');
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);

    // Wait for debounce to fire
    await new Promise((r) => setTimeout(r, 100));

    const raw = await readFile(stateFilePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data['/a.jsonl'].offset).toBe(1);
    expect(data['/b.jsonl'].offset).toBe(2);
    expect(data['/c.jsonl'].offset).toBe(3);
  });
});
