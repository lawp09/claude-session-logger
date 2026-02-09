'use client';

import { useState } from 'react';
import { ChevronRight, Bot, Wrench, Clock, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useSessionSubagents, type Subagent } from '@/lib/hooks/use-sessions';

interface SubagentTreeProps {
  sessionId: string;
  onSelectSubagent?: (subagentId: string | null) => void;
  selectedSubagentId?: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    running: 'bg-accent/20 text-accent',
    completed: 'bg-surface text-text-muted',
    error: 'bg-red-500/20 text-red-400',
  };
  const label: Record<string, string> = {
    running: 'actif',
    completed: 'termine',
    error: 'erreur',
  };
  const cls = colorMap[status] ?? 'bg-surface text-text-muted';

  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label[status] ?? status}
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return '-';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`;
}

function SubagentNode({
  subagent,
  isSelected,
  onSelect,
}: {
  subagent: Subagent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        isSelected
          ? 'bg-accent/10 text-accent'
          : 'text-text-secondary hover:bg-surface/50'
      }`}
    >
      <Bot size={14} className="shrink-0 text-text-muted" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-text-primary">
            {subagent.agentType || 'subagent'}
          </span>
          <StatusBadge status={subagent.status} />
        </div>

        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
          {subagent.startedAt && (
            <span className="flex items-center gap-0.5">
              <Clock size={10} />
              {formatDistanceToNow(new Date(subagent.startedAt), { addSuffix: true, locale: fr })}
            </span>
          )}
          {subagent.totalDurationMs != null && (
            <span>{formatDuration(subagent.totalDurationMs)}</span>
          )}
          {subagent.totalTokens != null && subagent.totalTokens > 0 && (
            <span className="flex items-center gap-0.5">
              <Zap size={10} />
              {subagent.totalTokens.toLocaleString()}
            </span>
          )}
          {subagent.totalToolUseCount != null && subagent.totalToolUseCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Wrench size={10} />
              {subagent.totalToolUseCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function SubagentTree({
  sessionId,
  onSelectSubagent,
  selectedSubagentId,
}: SubagentTreeProps) {
  const { data: subagents, isLoading } = useSessionSubagents(sessionId);
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return null;
  }

  if (!subagents || subagents.length === 0) {
    return null;
  }

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex w-full items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <Bot size={12} />
        Subagents ({subagents.length})
      </button>

      {expanded && (
        <div className="mt-1.5 ml-1 space-y-0.5">
          {selectedSubagentId && (
            <button
              onClick={() => onSelectSubagent?.(null)}
              className="mb-1 text-[11px] text-accent hover:underline"
            >
              Voir tous les messages
            </button>
          )}
          {subagents.map((sa) => (
            <SubagentNode
              key={sa.id}
              subagent={sa}
              isSelected={selectedSubagentId === sa.id}
              onSelect={() =>
                onSelectSubagent?.(
                  selectedSubagentId === sa.id ? null : sa.id
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
