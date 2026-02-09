'use client';

import { useMemo } from 'react';
import { Clock, FileText, Wrench } from 'lucide-react';
import { useSessionStats, useSessionMessages, type ContentBlock } from '@/lib/hooks/use-sessions';
import SubagentTree from './subagent-tree';

interface DetailPanelProps {
  sessionId: string;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function extractModifiedFiles(blocks: ContentBlock[]): string[] {
  const files = new Set<string>();
  for (const block of blocks) {
    if (block.blockType !== 'tool_use' || !block.toolInput) continue;
    const name = block.toolName;
    if (name === 'Write' || name === 'Edit' || name === 'Read') {
      const fp = block.toolInput.file_path;
      if (typeof fp === 'string') files.add(fp);
    }
  }
  return Array.from(files).sort();
}

export default function DetailPanel({ sessionId }: DetailPanelProps) {
  const { data: stats, isLoading: statsLoading } = useSessionStats(sessionId);
  const { data: messagesData } = useSessionMessages(sessionId);

  const allMessages = useMemo(() => {
    if (!messagesData?.pages) return [];
    return messagesData.pages.flatMap((page) => page.messages);
  }, [messagesData]);

  const modifiedFiles = useMemo(() => {
    const allBlocks = allMessages.flatMap((m) => m.contentBlocks || []);
    return extractModifiedFiles(allBlocks);
  }, [allMessages]);

  const writeFiles = useMemo(() => {
    const files = new Set<string>();
    for (const msg of allMessages) {
      for (const block of msg.contentBlocks || []) {
        if (block.blockType === 'tool_use' && (block.toolName === 'Write' || block.toolName === 'Edit')) {
          const fp = block.toolInput?.file_path;
          if (typeof fp === 'string') files.add(fp);
        }
      }
    }
    return files;
  }, [allMessages]);

  if (statsLoading) {
    return (
      <div className="flex h-full items-center justify-center border-l border-border bg-sidebar">
        <p className="text-sm text-text-muted">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-sidebar">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Details de la session</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* Resume */}
        {stats && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
              <Clock size={12} />
              Resume
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Duree" value={stats.durationMs ? formatDuration(stats.durationMs) : '-'} />
              <StatCard label="Messages" value={String(stats.messageCount)} />
              <StatCard label="Tokens in" value={formatTokens(stats.totalInputTokens)} />
              <StatCard label="Tokens out" value={formatTokens(stats.totalOutputTokens)} />
              {stats.totalCacheReadTokens > 0 && (
                <StatCard label="Cache lus" value={formatTokens(stats.totalCacheReadTokens)} />
              )}
              <StatCard label="Outils" value={String(stats.toolUseCount)} />
            </div>
          </section>
        )}

        {/* Subagents */}
        <SubagentTree sessionId={sessionId} />

        {/* Fichiers modifies */}
        {modifiedFiles.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
              <FileText size={12} />
              Fichiers ({modifiedFiles.length})
            </h4>
            <div className="space-y-0.5">
              {modifiedFiles.map((fp) => {
                const parts = fp.split('/');
                const filename = parts[parts.length - 1];
                const dir = parts.slice(0, -1).join('/');
                const isWritten = writeFiles.has(fp);
                return (
                  <div
                    key={fp}
                    className="flex items-start gap-1.5 rounded px-2 py-1 text-xs hover:bg-surface"
                    title={fp}
                  >
                    <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                      isWritten ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {isWritten ? 'W' : 'R'}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-text-primary">{filename}</span>
                      {dir && (
                        <span className="block truncate text-text-muted">{dir}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Statistiques outils */}
        {stats && stats.topTools.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
              <Wrench size={12} />
              Outils utilises
            </h4>
            <div className="space-y-1">
              {stats.topTools.map((tool: { name: string; count: number }) => {
                const maxCount = stats.topTools[0].count;
                const pct = Math.round((tool.count / maxCount) * 100);
                return (
                  <div key={tool.name} className="flex items-center gap-2">
                    <span className="w-16 truncate text-xs text-text-secondary">{tool.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs text-text-muted">{tool.count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
