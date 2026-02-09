/**
 * Types for JSONL message parsing
 * Based on Claude Code JSONL format analysis
 */

// 8 message types identified in JSONL files
export type MessageType =
  | 'user'
  | 'assistant'
  | 'progress'
  | 'system'
  | 'file-history-snapshot'
  | 'summary'
  | 'queue-operation'
  | 'pr-link';

// Types to skip (not stored in DB)
export const SKIP_TYPES: ReadonlySet<MessageType> = new Set([
  'progress',
  'file-history-snapshot',
]);

// Content block types within assistant messages
export type ContentBlockType = 'thinking' | 'text' | 'tool_use' | 'tool_result';

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock | ToolResultBlock;

// Raw JSONL line structure
export interface RawJsonlMessage {
  parentUuid?: string;
  uuid: string;
  type: MessageType;
  message?: {
    role?: string;
    model?: string;
    content?: ContentBlock[] | string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  requestId?: string;
  timestamp: string;
  isSidechain?: boolean;
  // system message fields
  subtype?: string;
  duration?: number;
  // summary fields
  summary?: string;
}

// Parsed message ready for DB insertion
export interface ParsedMessage {
  id: string;
  sessionId: string;
  parentUuid?: string;
  type: MessageType;
  role?: string;
  model?: string;
  requestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  stopReason?: string;
  isSidechain: boolean;
  timestamp: string;
  subtype?: string;
  durationMs?: number;
  contentBlocks: ParsedContentBlock[];
}

export interface ParsedContentBlock {
  blockIndex: number;
  blockType: ContentBlockType;
  textContent?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResultContent?: string;
  toolResultIsError?: boolean;
}

// Session metadata extracted from file path
export interface SessionMetadata {
  sessionId: string;
  projectPath: string;
  projectSlug: string;
  filePath: string;
}

// Batch payload sent to /api/ingest
export interface IngestPayload {
  session: SessionMetadata;
  messages: ParsedMessage[];
  fileOffset: number;
}
