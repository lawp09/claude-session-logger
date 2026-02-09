import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWatcher, type FileEvent } from './file-watcher.js';

describe('FileWatcher', () => {
  let tempDir: string;
  let watcher: FileWatcher;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'csl-watcher-test-'));
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  function waitForEvent<T>(emitter: FileWatcher, event: string, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
      emitter.once(event as any, (...args: any[]) => {
        clearTimeout(timer);
        resolve(args[0] as T);
      });
    });
  }

  function collectFileEvents(emitter: FileWatcher): FileEvent[] {
    const collected: FileEvent[] = [];
    emitter.on('file', (evt: FileEvent) => {
      collected.push(evt);
    });
    return collected;
  }

  it('should emit add event when a new .jsonl file is created', async () => {
    const projectDir = join(tempDir, '-Users-me-project');
    await mkdir(projectDir, { recursive: true });

    watcher = new FileWatcher({ watchDir: tempDir });
    const readyPromise = waitForEvent(watcher, 'ready');
    watcher.start();
    await readyPromise;

    const filePromise = waitForEvent<FileEvent>(watcher, 'file');
    const sessionFile = join(projectDir, 'abc-123-uuid.jsonl');
    await writeFile(sessionFile, '{"line":1}\n', 'utf-8');

    const evt = await filePromise;
    expect(evt.type).toBe('add');
    expect(evt.filePath).toBe(sessionFile);
    expect(evt.sessionId).toBe('abc-123-uuid');
    expect(evt.projectSlug).toBe('-Users-me-project');
    expect(evt.isSubagent).toBe(false);
  });

  it('should emit change event when a .jsonl file is appended to', async () => {
    const projectDir = join(tempDir, '-Users-me-project');
    await mkdir(projectDir, { recursive: true });
    const sessionFile = join(projectDir, 'session-001.jsonl');
    await writeFile(sessionFile, '{"line":1}\n', 'utf-8');

    watcher = new FileWatcher({ watchDir: tempDir });
    const readyPromise = waitForEvent(watcher, 'ready');
    watcher.start();
    await readyPromise;

    const changePromise = waitForEvent<FileEvent>(watcher, 'file');
    await appendFile(sessionFile, '{"line":2}\n', 'utf-8');

    const evt = await changePromise;
    expect(evt.type).toBe('change');
    expect(evt.filePath).toBe(sessionFile);
    expect(evt.sessionId).toBe('session-001');
  });

  it('should ignore non-.jsonl files', async () => {
    const projectDir = join(tempDir, '-Users-me-project');
    await mkdir(projectDir, { recursive: true });

    watcher = new FileWatcher({ watchDir: tempDir });
    const collected = collectFileEvents(watcher);
    const readyPromise = waitForEvent(watcher, 'ready');
    watcher.start();
    await readyPromise;

    await writeFile(join(projectDir, 'readme.txt'), 'hello', 'utf-8');
    await writeFile(join(projectDir, 'data.json'), '{}', 'utf-8');
    await writeFile(join(projectDir, 'notes.md'), '# notes', 'utf-8');

    await new Promise((r) => setTimeout(r, 500));

    expect(collected).toHaveLength(0);
  });

  it('should detect subagent files and set isSubagent=true', async () => {
    const sessionId = '84046819-b735-4905-affe-45bad7e8b2d0';
    const subagentDir = join(tempDir, '-Users-me-project', sessionId, 'subagents');
    await mkdir(subagentDir, { recursive: true });

    watcher = new FileWatcher({ watchDir: tempDir });
    const readyPromise = waitForEvent(watcher, 'ready');
    watcher.start();
    await readyPromise;

    const filePromise = waitForEvent<FileEvent>(watcher, 'file');
    const agentFile = join(subagentDir, 'agent-a61e6ce.jsonl');
    await writeFile(agentFile, '{"agent":true}\n', 'utf-8');

    const evt = await filePromise;
    expect(evt.type).toBe('add');
    expect(evt.filePath).toBe(agentFile);
    expect(evt.sessionId).toBe(sessionId);
    expect(evt.projectSlug).toBe('-Users-me-project');
    expect(evt.isSubagent).toBe(true);
  });

  it('should emit ready after initial scan', async () => {
    const projectDir = join(tempDir, '-Users-me-project');
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'existing.jsonl'), '{"existing":true}\n', 'utf-8');

    watcher = new FileWatcher({ watchDir: tempDir });
    const collected = collectFileEvents(watcher);
    const readyPromise = waitForEvent(watcher, 'ready');
    watcher.start();
    await readyPromise;

    // The existing file should have been picked up during initial scan
    expect(collected.length).toBeGreaterThanOrEqual(1);
    expect(collected[0].type).toBe('add');
    expect(collected[0].sessionId).toBe('existing');
  });
});
