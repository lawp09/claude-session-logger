/**
 * CSL Daemon - Entry point
 *
 * File watcher + JSONL parser + HTTP ingest client
 * Runs on Mac via launchd, watches ~/.claude/projects/ for JSONL changes
 */

console.log('csl-daemon starting...');
