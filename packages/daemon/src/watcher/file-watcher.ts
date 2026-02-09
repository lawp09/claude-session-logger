import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'node:events';
import { basename, relative, sep } from 'node:path';

export interface FileWatcherConfig {
  watchDir: string;
}

export interface FileEvent {
  type: 'add' | 'change';
  filePath: string;
  sessionId: string;
  projectSlug: string;
  isSubagent: boolean;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private readonly watchDir: string;

  constructor(watchDirOrConfig: string | FileWatcherConfig) {
    super();
    this.watchDir =
      typeof watchDirOrConfig === 'string' ? watchDirOrConfig : watchDirOrConfig.watchDir;
  }

  start(): void {
    this.watcher = watch(this.watchDir, {
      persistent: true,
      ignoreInitial: false,
      depth: 5,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (filePath) => {
      this.handleFileEvent('add', filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.handleFileEvent('change', filePath);
    });

    this.watcher.on('error', (err) => {
      this.emit('error', err);
    });

    this.watcher.on('ready', () => {
      this.emit('ready');
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private handleFileEvent(type: 'add' | 'change', filePath: string): void {
    if (!basename(filePath).endsWith('.jsonl')) return;

    const event = this.parseFilePath(type, filePath);
    if (event) {
      this.emit('file', event);
    }
  }

  private parseFilePath(type: 'add' | 'change', filePath: string): FileEvent | null {
    // relative path from watchDir: <project-slug>/<session-uuid>.jsonl
    // or: <project-slug>/<session-uuid>/subagents/agent-xxx.jsonl
    const rel = relative(this.watchDir, filePath);
    const parts = rel.split(sep);

    if (parts.length < 2) return null;

    const projectSlug = parts[0];
    const isSubagent = parts.includes('subagents');

    let sessionId: string;
    if (isSubagent) {
      // <project-slug>/<session-uuid>/subagents/agent-xxx.jsonl
      sessionId = parts[1];
    } else {
      // <project-slug>/<session-uuid>.jsonl
      sessionId = basename(parts[1], '.jsonl');
    }

    return { type, filePath, sessionId, projectSlug, isSubagent };
  }
}
