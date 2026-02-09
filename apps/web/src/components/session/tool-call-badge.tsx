'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ContentBlock } from '@/lib/hooks/use-sessions';

const toolColors: Record<string, string> = {
  Read: 'bg-blue-500/20 text-blue-400',
  Write: 'bg-green-500/20 text-green-400',
  Edit: 'bg-yellow-500/20 text-yellow-400',
  Bash: 'bg-red-500/20 text-red-400',
  Glob: 'bg-purple-500/20 text-purple-400',
  Grep: 'bg-indigo-500/20 text-indigo-400',
  Task: 'bg-cyan-500/20 text-cyan-400',
  WebSearch: 'bg-orange-500/20 text-orange-400',
};

function getToolColor(name: string): string {
  return toolColors[name] || 'bg-surface text-text-secondary';
}

function getInputSummary(input: Record<string, unknown> | null): string {
  if (!input) return '';
  if (input.file_path) return String(input.file_path);
  if (input.command) return String(input.command).slice(0, 80);
  if (input.pattern) return String(input.pattern);
  if (input.query) return String(input.query).slice(0, 80);
  const keys = Object.keys(input);
  if (keys.length > 0) return `${keys.length} param(s)`;
  return '';
}

export default function ToolCallBadge({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const name = block.toolName || 'tool';
  const summary = getInputSummary(block.toolInput);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${getToolColor(name)}`}
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        {name}
        {summary && (
          <span className="ml-1 max-w-[200px] truncate opacity-70">{summary}</span>
        )}
      </button>
      {expanded && block.toolInput && (
        <pre className="mt-1 max-h-[200px] overflow-auto rounded-md bg-surface p-2 text-xs text-text-secondary">
          {JSON.stringify(block.toolInput, null, 2)}
        </pre>
      )}
    </div>
  );
}
