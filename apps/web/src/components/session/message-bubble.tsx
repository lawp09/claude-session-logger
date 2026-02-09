'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, ChevronRight } from 'lucide-react';
import type { Message, ContentBlock } from '@/lib/hooks/use-sessions';
import ToolCallBadge from './tool-call-badge';

function ThinkingBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const text = block.textContent || '';
  const wordCount = text.split(/\s+/).length;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-thinking hover:text-thinking/80 transition-colors"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        Reflexion (~{wordCount} mots)
      </button>
      {expanded && (
        <div className="mt-1 rounded-md border border-thinking/20 bg-thinking/5 p-2 text-sm text-text-secondary">
          {text}
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const content = block.toolResultContent || '';
  const preview = content.slice(0, 100);
  const isError = block.toolResultIsError;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1 text-xs transition-colors ${
          isError ? 'text-red-400 hover:text-red-300' : 'text-text-muted hover:text-text-secondary'
        }`}
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        {isError ? 'Erreur' : 'Resultat'}: {preview}{content.length > 100 ? '...' : ''}
      </button>
      {expanded && (
        <pre className={`mt-1 max-h-[300px] overflow-auto rounded-md p-2 text-xs ${
          isError ? 'bg-red-500/10 text-red-300' : 'bg-surface text-text-secondary'
        }`}>
          {content}
        </pre>
      )}
    </div>
  );
}

function renderBlock(block: ContentBlock) {
  switch (block.blockType) {
    case 'thinking':
      return <ThinkingBlock key={block.blockIndex} block={block} />;
    case 'text':
      return (
        <div key={block.blockIndex} className="prose prose-invert prose-sm max-w-none text-text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {block.textContent || ''}
          </ReactMarkdown>
        </div>
      );
    case 'tool_use':
      return <ToolCallBadge key={block.blockIndex} block={block} />;
    case 'tool_result':
      return <ToolResultBlock key={block.blockIndex} block={block} />;
    default:
      return null;
  }
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const blocks = message.contentBlocks || [];

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="mt-1 shrink-0">
        {isUser ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent">
            <User size={14} />
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-text-secondary">
            <Bot size={14} />
          </div>
        )}
      </div>

      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser ? 'bg-bubble-user' : 'bg-transparent'
        }`}
      >
        {blocks.length > 0 ? (
          blocks.map(renderBlock)
        ) : (
          <p className="text-sm text-text-secondary">
            {message.type === 'summary' ? '(resume de session)' : '(vide)'}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
          {message.model && <span>{message.model}</span>}
          {(message.inputTokens || message.outputTokens) && (
            <span>
              {message.inputTokens?.toLocaleString() || 0} / {message.outputTokens?.toLocaleString() || 0} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
