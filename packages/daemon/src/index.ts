import { homedir } from 'node:os';
import { join, relative, dirname, basename } from 'node:path';
import { open, mkdir, readFile } from 'node:fs/promises';
import { FileWatcher, type FileEvent } from './watcher/file-watcher.js';
import { StateManager } from './state/state-manager.js';
import { LocalBuffer } from './http/local-buffer.js';
import { IngestClient } from './http/ingest-client.js';
import { parseJsonlChunk, deduplicateMessages } from './parser/jsonl-parser.js';
import type { SessionMetadata } from './parser/message-types.js';

const LOG_PREFIX = '[csl-daemon]';

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) {
    console.error(`${LOG_PREFIX} Missing required env var: ${key}`);
    process.exit(1);
  }
  return val;
}

const config = {
  apiUrl: env('CSL_API_URL'),
  apiToken: env('CSL_API_TOKEN'),
  watchDir: env('CSL_WATCH_DIR', join(homedir(), '.claude', 'projects')),
  stateFile: env('CSL_STATE_FILE', join(homedir(), '.claude-session-logger', 'state.json')),
  bufferDb: env('CSL_BUFFER_DB', join(homedir(), '.claude-session-logger', 'buffer.db')),
};

async function readFromOffset(filePath: string, offset: number): Promise<string> {
  const fileHandle = await open(filePath, 'r');
  try {
    const stats = await fileHandle.stat();
    if (stats.size <= offset) return '';
    const buffer = Buffer.alloc(stats.size - offset);
    await fileHandle.read(buffer, 0, buffer.byteLength, offset);
    return buffer.toString('utf-8');
  } finally {
    await fileHandle.close();
  }
}

function extractSessionMetadata(filePath: string, watchDir: string): SessionMetadata | null {
  const rel = relative(watchDir, filePath);
  const parts = rel.split('/');
  if (parts.length < 2) return null;

  const projectSlug = parts[0];
  const sessionId = basename(filePath, '.jsonl');

  return {
    sessionId,
    projectPath: watchDir,
    projectSlug,
    filePath,
  };
}

async function main(): Promise<void> {
  console.log(`${LOG_PREFIX} Starting...`);

  const dataDir = dirname(config.stateFile);
  await mkdir(dataDir, { recursive: true });

  const stateManager = new StateManager(config.stateFile);
  await stateManager.load();
  console.log(`${LOG_PREFIX} State loaded (${stateManager.getTrackedFiles().length} tracked files)`);

  const buffer = new LocalBuffer(config.bufferDb);
  buffer.init();
  console.log(`${LOG_PREFIX} Buffer initialized (${buffer.count()} pending)`);

  const ingestClient = new IngestClient({ apiUrl: config.apiUrl, apiToken: config.apiToken }, buffer);
  ingestClient.startRetryLoop();

  const watcher = new FileWatcher(config.watchDir);

  // Lire le summary depuis sessions-index.json du projet
  async function getIndexSummary(projectDir: string, sessionId: string): Promise<string | undefined> {
    try {
      const indexPath = join(projectDir, 'sessions-index.json');
      const raw = await readFile(indexPath, 'utf-8');
      const index = JSON.parse(raw);
      const entry = index.entries?.find((e: { sessionId: string }) => e.sessionId === sessionId);
      return entry?.summary || undefined;
    } catch {
      return undefined;
    }
  }

  async function handleFile(filePath: string): Promise<void> {
    const meta = extractSessionMetadata(filePath, config.watchDir);
    if (!meta) return;

    const offset = stateManager.getOffset(filePath);

    let data: string;
    try {
      data = await readFromOffset(filePath, offset);
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to read ${filePath}:`, err);
      return;
    }

    if (!data) return;

    const { messages, slug, bytesRead } = parseJsonlChunk(data, meta.sessionId);
    const deduplicated = deduplicateMessages(messages);

    // Priorité : sessions-index.json summary > slug JSONL
    const projectDir = dirname(filePath);
    const indexSummary = await getIndexSummary(projectDir, meta.sessionId);
    const summary = indexSummary || slug;

    if (deduplicated.length > 0 || summary) {
      const payload = {
        session: meta,
        messages: deduplicated,
        fileOffset: offset + bytesRead,
        ...(summary && { summary }),
      };

      await ingestClient.send(payload);
    }

    stateManager.setOffset(filePath, offset + bytesRead);
  }

  watcher.on('file', (event: FileEvent) => { void handleFile(event.filePath); });
  watcher.on('error', (err: Error) => { console.error(`${LOG_PREFIX} Watcher error:`, err); });
  watcher.on('ready', () => { console.log(`${LOG_PREFIX} Watching: ${config.watchDir}`); });

  watcher.start();

  async function shutdown(): Promise<void> {
    console.log(`${LOG_PREFIX} Shutting down...`);
    await watcher.stop();
    ingestClient.stopRetryLoop();
    await stateManager.flush();
    buffer.close();
    console.log(`${LOG_PREFIX} Stopped.`);
    process.exit(0);
  }

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch((err) => {
  console.error(`${LOG_PREFIX} Fatal error:`, err);
  process.exit(1);
});
