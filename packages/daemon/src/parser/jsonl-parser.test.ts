import { describe, it, expect } from 'vitest';
import { parseJsonlChunk, deduplicateMessages } from './jsonl-parser.js';
import type { ParsedMessage } from './message-types.js';
import crypto from 'node:crypto';

const uuid = () => crypto.randomUUID();
const SESSION_ID = uuid();

function makeUserTextLine(text: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'user',
    uuid: uuid(),
    parentUuid: uuid(),
    sessionId: SESSION_ID,
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: text },
    ...overrides,
  });
}

function makeUserToolResultLine(toolUseId: string, content: string, isError = false) {
  return JSON.stringify({
    type: 'user',
    uuid: uuid(),
    parentUuid: uuid(),
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: [{ tool_use_id: toolUseId, type: 'tool_result', content, is_error: isError }],
    },
  });
}

function makeAssistantLine(
  requestId: string,
  content: unknown[],
  stopReason: string | null = null,
  usage?: Record<string, number>,
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify({
    type: 'assistant',
    uuid: uuid(),
    requestId,
    parentUuid: uuid(),
    timestamp: new Date().toISOString(),
    message: {
      model: 'claude-opus-4-5-20251101',
      id: `msg_${uuid()}`,
      type: 'message',
      role: 'assistant',
      content,
      stop_reason: stopReason,
      ...(usage ? { usage } : {}),
    },
    ...overrides,
  });
}

function makeSystemLine(subtype: string, content?: string) {
  return JSON.stringify({
    type: 'system',
    uuid: uuid(),
    subtype,
    content: content ?? `<command-name>/mcp</command-name>`,
    level: 'info',
    isMeta: false,
    timestamp: new Date().toISOString(),
  });
}

function makeSummaryLine(summary: string) {
  return JSON.stringify({
    type: 'summary',
    uuid: uuid(),
    summary,
    leafUuid: uuid(),
    timestamp: new Date().toISOString(),
  });
}

function makeQueueOperationLine() {
  return JSON.stringify({
    type: 'queue-operation',
    uuid: uuid(),
    operation: 'enqueue',
    timestamp: new Date().toISOString(),
    sessionId: SESSION_ID,
    content: 'some queued content',
  });
}

function makeProgressLine() {
  return JSON.stringify({
    type: 'progress',
    uuid: uuid(),
    data: { type: 'hook_progress', hookEvent: 'PreToolUse' },
    timestamp: new Date().toISOString(),
  });
}

function makeFileHistorySnapshotLine() {
  return JSON.stringify({
    type: 'file-history-snapshot',
    uuid: uuid(),
    messageId: uuid(),
    snapshot: { messageId: uuid(), trackedFileBackups: {}, timestamp: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  });
}

describe('parseJsonlChunk', () => {
  // 1. Parse empty string
  it('should return empty result for empty string', () => {
    const result = parseJsonlChunk('', SESSION_ID);
    expect(result.messages).toEqual([]);
  });

  // 2. Parse single user message (text content)
  it('should parse single user message with text content', () => {
    const line = makeUserTextLine('Fix the auth flow');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].sessionId).toBe(SESSION_ID);
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].blockType).toBe('text');
    expect(result.messages[0].contentBlocks[0].textContent).toBe('Fix the auth flow');
  });

  // 3. Parse single user message (tool_result content)
  it('should parse single user message with tool_result content', () => {
    const toolUseId = `toolu_${uuid()}`;
    const line = makeUserToolResultLine(toolUseId, 'feature/upgrade');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].blockType).toBe('tool_result');
    expect(result.messages[0].contentBlocks[0].toolUseId).toBe(toolUseId);
    expect(result.messages[0].contentBlocks[0].toolResultContent).toBe('feature/upgrade');
  });

  // 4. Parse assistant message with text block
  it('should parse assistant message with text block', () => {
    const reqId = `req_${uuid()}`;
    const line = makeAssistantLine(reqId, [{ type: 'text', text: 'Let me check the file' }], 'end_turn');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('assistant');
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].blockType).toBe('text');
    expect(result.messages[0].contentBlocks[0].textContent).toBe('Let me check the file');
  });

  // 5. Parse assistant message with thinking block
  it('should parse assistant message with thinking block', () => {
    const reqId = `req_${uuid()}`;
    const line = makeAssistantLine(reqId, [{ type: 'thinking', thinking: 'I need to analyze', signature: 'sig123' }], 'end_turn');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].blockType).toBe('thinking');
    expect(result.messages[0].contentBlocks[0].textContent).toBe('I need to analyze');
  });

  // 6. Parse assistant message with tool_use block
  it('should parse assistant message with tool_use block', () => {
    const reqId = `req_${uuid()}`;
    const toolId = `toolu_${uuid()}`;
    const line = makeAssistantLine(reqId, [{
      type: 'tool_use',
      id: toolId,
      name: 'Bash',
      input: { command: 'git status' },
    }], 'end_turn');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    const block = result.messages[0].contentBlocks[0];
    expect(block.blockType).toBe('tool_use');
    expect(block.toolUseId).toBe(toolId);
    expect(block.toolName).toBe('Bash');
    expect(block.toolInput).toEqual({ command: 'git status' });
  });

  // 7. Parse assistant message with mixed content blocks
  it('should parse assistant message with mixed content blocks (thinking + text + tool_use)', () => {
    const reqId = `req_${uuid()}`;
    const toolId = `toolu_${uuid()}`;
    const line = makeAssistantLine(reqId, [
      { type: 'thinking', thinking: 'Analyzing...', signature: 'sig' },
      { type: 'text', text: 'Let me check' },
      { type: 'tool_use', id: toolId, name: 'Read', input: { file_path: '/tmp/test.ts' } },
    ], 'end_turn');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].contentBlocks).toHaveLength(3);
    expect(result.messages[0].contentBlocks[0].blockType).toBe('thinking');
    expect(result.messages[0].contentBlocks[0].blockIndex).toBe(0);
    expect(result.messages[0].contentBlocks[1].blockType).toBe('text');
    expect(result.messages[0].contentBlocks[1].blockIndex).toBe(1);
    expect(result.messages[0].contentBlocks[2].blockType).toBe('tool_use');
    expect(result.messages[0].contentBlocks[2].blockIndex).toBe(2);
  });

  // 8. Parse system message with subtype
  it('should parse system message with subtype', () => {
    const line = makeSystemLine('local_command');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('system');
    expect(result.messages[0].subtype).toBe('local_command');
  });

  // 9. Extraire le slug (nom auto-généré par Claude Code)
  it('should extract slug from JSONL messages', () => {
    const line = makeUserTextLine('Hello', { slug: 'parallel-leaping-brooks' });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.slug).toBe('parallel-leaping-brooks');
  });

  // 9b. Slug extrait du premier message qui en a un
  it('should extract slug from first message only', () => {
    const lines = [
      makeUserTextLine('first', { slug: 'first-slug' }),
      makeUserTextLine('second', { slug: 'second-slug' }),
    ].join('\n');
    const result = parseJsonlChunk(lines, SESSION_ID);

    expect(result.slug).toBe('first-slug');
  });

  // 10. Parse queue-operation message
  it('should parse queue-operation message', () => {
    const line = makeQueueOperationLine();
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('queue-operation');
  });

  // 11. Skip progress messages
  it('should skip progress messages', () => {
    const line = makeProgressLine();
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(0);
  });

  // 12. Skip file-history-snapshot messages
  it('should skip file-history-snapshot messages', () => {
    const line = makeFileHistorySnapshotLine();
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(0);
  });

  // 16. Extract token usage from assistant message
  it('should extract token usage from assistant message', () => {
    const reqId = `req_${uuid()}`;
    const line = makeAssistantLine(
      reqId,
      [{ type: 'text', text: 'Done' }],
      'end_turn',
      { input_tokens: 1500, output_tokens: 200, cache_creation_input_tokens: 100, cache_read_input_tokens: 50 },
    );
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].inputTokens).toBe(1500);
    expect(result.messages[0].outputTokens).toBe(200);
    expect(result.messages[0].cacheCreationTokens).toBe(100);
    expect(result.messages[0].cacheReadTokens).toBe(50);
  });

  // 17. Extract model name from assistant message
  it('should extract model name from assistant message', () => {
    const reqId = `req_${uuid()}`;
    const line = makeAssistantLine(reqId, [{ type: 'text', text: 'Hi' }], 'end_turn');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages[0].model).toBe('claude-opus-4-5-20251101');
  });

  // 18. Extract stop_reason from assistant message
  it('should extract stop_reason from assistant message', () => {
    const reqId = `req_${uuid()}`;
    const lineNull = makeAssistantLine(reqId, [{ type: 'text', text: 'partial' }], null);
    const lineFinal = makeAssistantLine(reqId, [{ type: 'text', text: 'done' }], 'end_turn');

    const resultNull = parseJsonlChunk(lineNull, SESSION_ID);
    const resultFinal = parseJsonlChunk(lineFinal, SESSION_ID);

    expect(resultNull.messages[0].stopReason).toBeUndefined();
    expect(resultFinal.messages[0].stopReason).toBe('end_turn');
  });

  // 19. Handle isSidechain flag
  it('should handle isSidechain flag', () => {
    const line = makeAssistantLine(
      `req_${uuid()}`,
      [{ type: 'text', text: 'sidechain' }],
      'end_turn',
      undefined,
      { isSidechain: true },
    );
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages[0].isSidechain).toBe(true);
  });

  // 20. Handle malformed JSON line
  it('should skip malformed JSON lines gracefully', () => {
    const data = 'not valid json\n' + makeUserTextLine('valid message');
    const result = parseJsonlChunk(data, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].textContent).toBe('valid message');
  });

  // 21. Handle empty lines
  it('should skip empty lines', () => {
    const data = '\n\n' + makeUserTextLine('hello') + '\n\n';
    const result = parseJsonlChunk(data, SESSION_ID);

    expect(result.messages).toHaveLength(1);
  });

  // 22. Handle missing message field
  it('should skip lines missing uuid gracefully', () => {
    const line = JSON.stringify({ type: 'user', timestamp: new Date().toISOString() });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(0);
  });

  // 23. Calculate bytesRead correctly
  it('should calculate bytesRead correctly', () => {
    const data = makeUserTextLine('hello');
    const result = parseJsonlChunk(data, SESSION_ID);

    expect(result.bytesRead).toBe(Buffer.byteLength(data, 'utf-8'));
  });

  // 24. Parse multiple messages in sequence
  it('should parse multiple messages in sequence', () => {
    const lines = [
      makeUserTextLine('first'),
      makeAssistantLine(`req_${uuid()}`, [{ type: 'text', text: 'response' }], 'end_turn'),
      makeSystemLine('local_command'),
    ].join('\n');

    const result = parseJsonlChunk(lines, SESSION_ID);
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[1].type).toBe('assistant');
    expect(result.messages[2].type).toBe('system');
  });

  // 25. Truncate tool_result content over 50KB
  it('should truncate tool_result content over 50KB', () => {
    const toolUseId = `toolu_${uuid()}`;
    const bigContent = 'x'.repeat(60 * 1024); // 60KB
    const line = makeUserToolResultLine(toolUseId, bigContent);
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    const block = result.messages[0].contentBlocks[0];
    expect(block.toolResultContent!.length).toBeLessThan(bigContent.length);
    expect(block.toolResultContent!.endsWith('[TRUNCATED]')).toBe(true);
  });

  // 26. Real-world queue-operation without uuid should be skipped
  it('should skip queue-operation lines without uuid (real-world format)', () => {
    const line = JSON.stringify({
      type: 'queue-operation',
      operation: 'dequeue',
      timestamp: new Date().toISOString(),
      sessionId: SESSION_ID,
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(0);
  });

  // 27. Parse message with no message field (system with hook info)
  it('should parse system message without message field', () => {
    const line = JSON.stringify({
      type: 'system',
      uuid: uuid(),
      subtype: 'stop_hook_summary',
      hookCount: 2,
      hookInfos: [{ command: 'afplay' }],
      hookErrors: [],
      preventedContinuation: false,
      stopReason: '',
      hasOutput: false,
      level: 'suggestion',
      timestamp: new Date().toISOString(),
      toolUseID: uuid(),
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('system');
    expect(result.messages[0].subtype).toBe('stop_hook_summary');
    expect(result.messages[0].contentBlocks).toHaveLength(0);
  });

  // 28. Parse user meta message (isMeta: true)
  it('should parse user meta messages with isMeta flag', () => {
    const line = JSON.stringify({
      type: 'user',
      uuid: uuid(),
      parentUuid: uuid(),
      isMeta: true,
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: '<local-command-caveat>some caveat</local-command-caveat>',
      },
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].textContent).toContain('local-command-caveat');
  });

  // 29. Parse user message with extra real-world fields (cwd, gitBranch, version, slug)
  it('should parse user messages with extra fields from real JSONL', () => {
    const line = JSON.stringify({
      type: 'user',
      uuid: uuid(),
      parentUuid: uuid(),
      isSidechain: false,
      userType: 'external',
      cwd: '/Users/test/project',
      sessionId: SESSION_ID,
      version: '2.1.4',
      gitBranch: 'main',
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: 'Hello' },
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('user');
    expect(result.messages[0].isSidechain).toBe(false);
  });

  // 30. Parse tool_result with array content (real-world: multiple text blocks)
  it('should parse tool_result with array content blocks', () => {
    const toolUseId = `toolu_${uuid()}`;
    const line = JSON.stringify({
      type: 'user',
      uuid: uuid(),
      parentUuid: uuid(),
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: [
            { type: 'text', text: 'Review report line 1' },
            { type: 'text', text: 'agentId: a589310' },
          ],
          is_error: false,
        }],
      },
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    const block = result.messages[0].contentBlocks[0];
    expect(block.blockType).toBe('tool_result');
    expect(block.toolResultContent).toContain('Review report line 1');
    expect(block.toolResultIsError).toBe(false);
  });

  // 31. Truncate multi-byte UTF-8 tool_result correctly
  it('should truncate multi-byte UTF-8 content by bytes not characters', () => {
    const toolUseId = `toolu_${uuid()}`;
    // Each emoji is 4 bytes in UTF-8
    const emoji = '\u{1F600}'; // grinning face
    const bigContent = emoji.repeat(20 * 1024); // ~80KB in bytes
    const line = makeUserToolResultLine(toolUseId, bigContent);
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    const block = result.messages[0].contentBlocks[0];
    expect(block.toolResultContent!.endsWith('[TRUNCATED]')).toBe(true);
    // Content before [TRUNCATED] should be valid UTF-8 (no broken characters)
    const contentBeforeTruncation = block.toolResultContent!.replace('[TRUNCATED]', '');
    expect(() => Buffer.from(contentBeforeTruncation, 'utf-8').toString('utf-8')).not.toThrow();
  });

  // 32. Parse tool_result with is_error: true
  it('should parse tool_result with is_error flag', () => {
    const toolUseId = `toolu_${uuid()}`;
    const line = makeUserToolResultLine(toolUseId, 'Error: ENOENT file not found', true);
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    const block = result.messages[0].contentBlocks[0];
    expect(block.toolResultIsError).toBe(true);
    expect(block.toolResultContent).toBe('Error: ENOENT file not found');
  });

  // 33. Parse tool_result with empty string content
  it('should parse tool_result with empty content string', () => {
    const toolUseId = `toolu_${uuid()}`;
    const line = makeUserToolResultLine(toolUseId, '');
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    const block = result.messages[0].contentBlocks[0];
    expect(block.blockType).toBe('tool_result');
    expect(block.toolResultContent).toBe('');
  });

  // 34. Parse assistant message with empty content array
  it('should parse assistant message with empty content array', () => {
    const reqId = `req_${uuid()}`;
    const line = makeAssistantLine(reqId, [], null);
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].contentBlocks).toHaveLength(0);
  });

  // 35. Skip lines missing type field
  it('should skip lines missing type field', () => {
    const line = JSON.stringify({ uuid: uuid(), timestamp: new Date().toISOString() });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(0);
  });

  // 36. Handle pr-link message type
  it('should parse pr-link message type', () => {
    const line = JSON.stringify({
      type: 'pr-link',
      uuid: uuid(),
      timestamp: new Date().toISOString(),
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].type).toBe('pr-link');
  });

  // 37. Parse user message with toolUseResult metadata (real-world)
  it('should parse user tool_result with toolUseResult metadata', () => {
    const toolUseId = `toolu_${uuid()}`;
    const line = JSON.stringify({
      type: 'user',
      uuid: uuid(),
      parentUuid: uuid(),
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: [{ tool_use_id: toolUseId, type: 'tool_result', content: 'output', is_error: false }],
      },
      toolUseResult: {
        stdout: 'output',
        stderr: '',
        interrupted: false,
        isImage: false,
      },
      sourceToolAssistantUUID: uuid(),
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].toolResultContent).toBe('output');
  });

  // 38. Handle unknown content block types gracefully
  it('should skip unknown content block types', () => {
    const reqId = `req_${uuid()}`;
    const line = JSON.stringify({
      type: 'assistant',
      uuid: uuid(),
      requestId: reqId,
      parentUuid: uuid(),
      timestamp: new Date().toISOString(),
      message: {
        model: 'claude-opus-4-5-20251101',
        role: 'assistant',
        content: [
          { type: 'text', text: 'known' },
          { type: 'server_tool_use', id: 'st_123', name: 'web_search' },
        ],
        stop_reason: 'end_turn',
      },
    });
    const result = parseJsonlChunk(line, SESSION_ID);

    expect(result.messages).toHaveLength(1);
    // Unknown block type should be filtered out, only text remains
    expect(result.messages[0].contentBlocks).toHaveLength(1);
    expect(result.messages[0].contentBlocks[0].blockType).toBe('text');
  });
});

describe('deduplicateMessages', () => {
  function makeParsedAssistant(requestId: string, stopReason?: string): ParsedMessage {
    return {
      id: uuid(),
      sessionId: SESSION_ID,
      type: 'assistant',
      role: 'assistant',
      requestId,
      stopReason,
      isSidechain: false,
      timestamp: new Date().toISOString(),
      contentBlocks: [{ blockIndex: 0, blockType: 'text', textContent: stopReason ? 'final' : 'partial' }],
    };
  }

  function makeParsedUser(text: string): ParsedMessage {
    return {
      id: uuid(),
      sessionId: SESSION_ID,
      type: 'user',
      role: 'user',
      isSidechain: false,
      timestamp: new Date().toISOString(),
      contentBlocks: [{ blockIndex: 0, blockType: 'text', textContent: text }],
    };
  }

  // 13. Deduplicate: two assistant messages same requestId -> keep last
  it('should keep only the last assistant message per requestId', () => {
    const reqId = `req_${uuid()}`;
    const partial = makeParsedAssistant(reqId);
    const final = makeParsedAssistant(reqId, 'end_turn');

    const result = deduplicateMessages([partial, final]);
    expect(result).toHaveLength(1);
    expect(result[0].stopReason).toBe('end_turn');
    expect(result[0].contentBlocks[0].textContent).toBe('final');
  });

  // 14. Deduplicate: different requestIds -> keep both
  it('should keep assistant messages with different requestIds', () => {
    const msg1 = makeParsedAssistant(`req_${uuid()}`, 'end_turn');
    const msg2 = makeParsedAssistant(`req_${uuid()}`, 'end_turn');

    const result = deduplicateMessages([msg1, msg2]);
    expect(result).toHaveLength(2);
  });

  // 15. Deduplicate: mix of types (only dedup assistant)
  it('should only deduplicate assistant messages', () => {
    const reqId = `req_${uuid()}`;
    const user = makeParsedUser('hello');
    const partial = makeParsedAssistant(reqId);
    const final = makeParsedAssistant(reqId, 'end_turn');

    const result = deduplicateMessages([user, partial, final]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('user');
    expect(result[1].type).toBe('assistant');
    expect(result[1].stopReason).toBe('end_turn');
  });
});
