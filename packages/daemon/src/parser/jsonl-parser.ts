import type {
  ContentBlock,
  MessageType,
  ParsedContentBlock,
  ParsedMessage,
  RawJsonlMessage,
} from './message-types.js';
import { SKIP_TYPES } from './message-types.js';

const TOOL_RESULT_MAX_BYTES = 50 * 1024; // 50KB

export interface ParseResult {
  messages: ParsedMessage[];
  bytesRead: number;
}

export function parseJsonlChunk(data: string, sessionId: string): ParseResult {
  const lines = data.split('\n');
  const messages: ParsedMessage[] = [];
  const bytesRead = Buffer.byteLength(data, 'utf-8');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    let raw: RawJsonlMessage;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!raw.type || !raw.uuid) continue;

    if (SKIP_TYPES.has(raw.type)) continue;

    const parsed = mapToParsedMessage(raw, sessionId);
    if (parsed) messages.push(parsed);
  }

  return { messages, bytesRead };
}

export function deduplicateMessages(messages: ParsedMessage[]): ParsedMessage[] {
  const lastByRequestId = new Map<string, number>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'assistant' && msg.requestId) {
      lastByRequestId.set(msg.requestId, i);
    }
  }

  return messages.filter((msg, index) => {
    if (msg.type === 'assistant' && msg.requestId) {
      return lastByRequestId.get(msg.requestId) === index;
    }
    return true;
  });
}

function mapToParsedMessage(raw: RawJsonlMessage, sessionId: string): ParsedMessage | null {
  const contentBlocks = extractContentBlocks(raw);

  return {
    id: raw.uuid,
    sessionId,
    parentUuid: raw.parentUuid,
    type: raw.type as MessageType,
    role: raw.message?.role,
    model: raw.message?.model,
    requestId: raw.requestId,
    inputTokens: raw.message?.usage?.input_tokens,
    outputTokens: raw.message?.usage?.output_tokens,
    cacheCreationTokens: raw.message?.usage?.cache_creation_input_tokens,
    cacheReadTokens: raw.message?.usage?.cache_read_input_tokens,
    stopReason: raw.message?.stop_reason ?? undefined,
    isSidechain: raw.isSidechain ?? false,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    subtype: raw.subtype,
    durationMs: raw.duration,
    contentBlocks,
  };
}

function extractContentBlocks(raw: RawJsonlMessage): ParsedContentBlock[] {
  const content = raw.message?.content;
  if (!content) return [];

  if (typeof content === 'string') {
    return [{
      blockIndex: 0,
      blockType: 'text',
      textContent: content,
    }];
  }

  if (!Array.isArray(content)) return [];

  return content.map((block: ContentBlock, index: number) => mapContentBlock(block, index)).filter(Boolean) as ParsedContentBlock[];
}

function mapContentBlock(block: ContentBlock, index: number): ParsedContentBlock | null {
  switch (block.type) {
    case 'thinking':
      return {
        blockIndex: index,
        blockType: 'thinking',
        textContent: block.thinking,
      };
    case 'text':
      return {
        blockIndex: index,
        blockType: 'text',
        textContent: block.text,
      };
    case 'tool_use':
      return {
        blockIndex: index,
        blockType: 'tool_use',
        toolUseId: block.id,
        toolName: block.name,
        toolInput: block.input,
      };
    case 'tool_result': {
      let resultContent: string;
      if (typeof block.content === 'string') {
        resultContent = block.content;
      } else if (Array.isArray(block.content)) {
        resultContent = JSON.stringify(block.content);
      } else {
        resultContent = '';
      }

      if (Buffer.byteLength(resultContent, 'utf-8') > TOOL_RESULT_MAX_BYTES) {
        resultContent = resultContent.slice(0, TOOL_RESULT_MAX_BYTES) + '[TRUNCATED]';
      }

      return {
        blockIndex: index,
        blockType: 'tool_result',
        toolUseId: block.tool_use_id,
        toolResultContent: resultContent,
        toolResultIsError: block.is_error,
      };
    }
    default:
      return null;
  }
}
