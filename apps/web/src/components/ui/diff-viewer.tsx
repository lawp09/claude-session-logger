'use client';

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10) - 1;
        newLine = parseInt(match[2], 10) - 1;
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      newLine++;
      result.push({ type: 'add', content: line.slice(1), newLine });
    } else if (line.startsWith('-')) {
      oldLine++;
      result.push({ type: 'remove', content: line.slice(1), oldLine });
    } else if (line.startsWith(' ') || line === '') {
      oldLine++;
      newLine++;
      result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, oldLine, newLine });
    }
  }

  return result;
}

const lineStyles: Record<DiffLine['type'], string> = {
  add: 'bg-diff-add-bg text-diff-add-text',
  remove: 'bg-diff-remove-bg text-diff-remove-text',
  context: 'text-text-secondary',
  header: 'text-text-muted bg-surface font-medium',
};

interface DiffViewerProps {
  diff: string;
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  const lines = parseDiff(diff);

  if (lines.length === 0) return null;

  return (
    <div className="overflow-auto rounded-md border border-border text-xs font-mono">
      {lines.map((line, i) => (
        <div key={i} className={`flex ${lineStyles[line.type]}`}>
          {line.type === 'header' ? (
            <span className="px-3 py-0.5">{line.content}</span>
          ) : (
            <>
              <span className="w-10 shrink-0 select-none px-1.5 py-0.5 text-right text-text-muted/50">
                {line.type === 'add' ? '' : line.oldLine ?? ''}
              </span>
              <span className="w-10 shrink-0 select-none px-1.5 py-0.5 text-right text-text-muted/50">
                {line.type === 'remove' ? '' : line.newLine ?? ''}
              </span>
              <span className="w-4 shrink-0 select-none py-0.5 text-center">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              <span className="flex-1 whitespace-pre py-0.5 pr-3">{line.content}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
