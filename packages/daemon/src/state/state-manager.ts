import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface FileState {
  [filePath: string]: {
    offset: number;
    lastUpdated: string;
  };
}

export class StateManager {
  private state: FileState = {};
  private dirty = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(
    private readonly stateFilePath: string,
    options?: { debounceMs?: number },
  ) {
    this.debounceMs = options?.debounceMs ?? 1000;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.stateFilePath, 'utf-8');
      this.state = JSON.parse(raw) as FileState;
    } catch (err: unknown) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        console.warn(`[StateManager] Corrupted state file, starting fresh: ${this.stateFilePath}`);
      }
      this.state = {};
    }
  }

  getOffset(filePath: string): number {
    return this.state[filePath]?.offset ?? 0;
  }

  setOffset(filePath: string, offset: number): void {
    this.state[filePath] = {
      offset,
      lastUpdated: new Date().toISOString(),
    };
    this.scheduleDiskWrite();
  }

  removeFile(filePath: string): void {
    delete this.state[filePath];
    this.scheduleDiskWrite();
  }

  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.writeToDisk();
  }

  getTrackedFiles(): string[] {
    return Object.keys(this.state);
  }

  private scheduleDiskWrite(): void {
    this.dirty = true;
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.writeToDisk().catch((err) => {
        console.error('[StateManager] Failed to write state:', err);
      });
    }, this.debounceMs);
  }

  private async writeToDisk(): Promise<void> {
    if (!this.dirty && Object.keys(this.state).length === 0) return;
    const dir = dirname(this.stateFilePath);
    await mkdir(dir, { recursive: true });
    const tmpPath = `${this.stateFilePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
    await rename(tmpPath, this.stateFilePath);
    this.dirty = false;
  }
}
