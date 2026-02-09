/**
 * Integration test: parse JSONL → extract messages → deduplicate → prepare ingest payload
 * Tests the full daemon pipeline with realistic JSONL data.
 */
import { describe, it, expect } from 'vitest';
import { parseJsonlChunk, deduplicateMessages } from '../parser/jsonl-parser.js';
import type { IngestPayload, SessionMetadata } from '../parser/message-types.js';
import crypto from 'node:crypto';

const uuid = () => crypto.randomUUID();

/**
 * Build a realistic JSONL session that mirrors real Claude Code output:
 * - file-history-snapshot (skipped)
 * - queue-operation without uuid (skipped)
 * - user message (text prompt)
 * - assistant partial (thinking, no stop_reason)
 * - assistant partial (text + tool_use, no stop_reason)
 * - user tool_result
 * - assistant final (text, stop_reason=end_turn, usage)
 * - system stop_hook_summary
 * - summary message
 * - progress (skipped)
 */
function buildRealisticSession() {
  const sessionId = uuid();
  const requestId1 = `req_${uuid()}`;
  const requestId2 = `req_${uuid()}`;
  const toolId = `toolu_${uuid()}`;

  const lines = [
    // 1. file-history-snapshot — should be skipped (no uuid, type in SKIP_TYPES)
    JSON.stringify({
      type: 'file-history-snapshot',
      messageId: uuid(),
      snapshot: { messageId: uuid(), trackedFileBackups: {}, timestamp: new Date().toISOString() },
      isSnapshotUpdate: false,
    }),

    // 2. queue-operation without uuid — should be skipped
    JSON.stringify({
      type: 'queue-operation',
      operation: 'dequeue',
      timestamp: new Date().toISOString(),
      sessionId,
    }),

    // 3. user message with text content
    JSON.stringify({
      type: 'user',
      uuid: uuid(),
      parentUuid: null,
      isSidechain: false,
      userType: 'external',
      cwd: '/Users/test/project',
      sessionId,
      version: '2.1.4',
      gitBranch: 'main',
      timestamp: '2026-02-09T10:00:00.000Z',
      message: { role: 'user', content: 'Fix the authentication bug in login flow' },
    }),

    // 4. assistant partial — thinking only, no stop_reason (same requestId1)
    JSON.stringify({
      type: 'assistant',
      uuid: uuid(),
      parentUuid: uuid(),
      isSidechain: false,
      requestId: requestId1,
      timestamp: '2026-02-09T10:00:01.000Z',
      message: {
        model: 'claude-opus-4-5-20251101',
        id: `msg_${uuid()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me analyze the auth module...', signature: 'sig123' }],
        stop_reason: null,
        usage: { input_tokens: 500, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }),

    // 5. assistant partial — text + tool_use, no stop_reason (same requestId1)
    JSON.stringify({
      type: 'assistant',
      uuid: uuid(),
      parentUuid: uuid(),
      isSidechain: false,
      requestId: requestId1,
      timestamp: '2026-02-09T10:00:02.000Z',
      message: {
        model: 'claude-opus-4-5-20251101',
        id: `msg_${uuid()}`,
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me analyze the auth module and check the login handler', signature: 'sig456' },
          { type: 'text', text: 'Let me read the auth module.' },
          { type: 'tool_use', id: toolId, name: 'Read', input: { file_path: '/src/auth.ts' } },
        ],
        stop_reason: null,
        usage: { input_tokens: 500, output_tokens: 150, cache_creation_input_tokens: 100, cache_read_input_tokens: 50 },
      },
    }),

    // 6. user tool_result
    JSON.stringify({
      type: 'user',
      uuid: uuid(),
      parentUuid: uuid(),
      isSidechain: false,
      timestamp: '2026-02-09T10:00:03.000Z',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolId, content: 'export function login(user: string, pass: string) { ... }', is_error: false }],
      },
      toolUseResult: { stdout: 'export function login...', stderr: '', interrupted: false, isImage: false },
    }),

    // 7. assistant final (requestId2) — text response with stop_reason
    JSON.stringify({
      type: 'assistant',
      uuid: uuid(),
      parentUuid: uuid(),
      isSidechain: false,
      requestId: requestId2,
      timestamp: '2026-02-09T10:00:04.000Z',
      message: {
        model: 'claude-opus-4-5-20251101',
        id: `msg_${uuid()}`,
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'I can see the bug...', signature: 'sig789' },
          { type: 'text', text: 'I found the issue in the login function. The password comparison is case-sensitive.' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1500, output_tokens: 200, cache_creation_input_tokens: 100, cache_read_input_tokens: 50 },
      },
    }),

    // 8. system stop_hook_summary
    JSON.stringify({
      type: 'system',
      uuid: uuid(),
      subtype: 'stop_hook_summary',
      hookCount: 1,
      hookInfos: [{ command: 'afplay -v 0.1 finish.mp3' }],
      hookErrors: [],
      preventedContinuation: false,
      stopReason: '',
      hasOutput: false,
      level: 'suggestion',
      timestamp: '2026-02-09T10:00:05.000Z',
    }),

    // 9. summary message
    JSON.stringify({
      type: 'summary',
      uuid: uuid(),
      summary: 'Fixed authentication bug in login flow',
      leafUuid: uuid(),
      timestamp: '2026-02-09T10:00:06.000Z',
    }),

    // 10. progress message — should be skipped
    JSON.stringify({
      type: 'progress',
      uuid: uuid(),
      data: { type: 'hook_progress', hookEvent: 'PreToolUse' },
      timestamp: '2026-02-09T10:00:07.000Z',
    }),
  ];

  return { sessionId, requestId1, requestId2, toolId, lines };
}

describe('Daemon parse pipeline (integration)', () => {
  it('should parse a realistic JSONL session and produce correct messages', () => {
    const { sessionId, lines } = buildRealisticSession();
    const data = lines.join('\n');

    const result = parseJsonlChunk(data, sessionId);

    // file-history-snapshot: skipped (no uuid field)
    // queue-operation: skipped (no uuid field)
    // progress: skipped (SKIP_TYPES)
    // remaining: user text, assistant partial x2, user tool_result, assistant final, system, summary
    expect(result.messages).toHaveLength(7);

    // Verify message types in order
    expect(result.messages.map(m => m.type)).toEqual([
      'user', 'assistant', 'assistant', 'user', 'assistant', 'system', 'summary',
    ]);

    // Verify bytesRead
    expect(result.bytesRead).toBe(Buffer.byteLength(data, 'utf-8'));
  });

  it('should deduplicate partial assistant messages by requestId', () => {
    const { sessionId, requestId1, lines } = buildRealisticSession();
    const data = lines.join('\n');

    const parsed = parseJsonlChunk(data, sessionId);
    const deduped = deduplicateMessages(parsed.messages);

    // requestId1 had 2 partials → keep only the last one
    // requestId2 had 1 message → keep it
    // user messages, system, summary → all kept
    expect(deduped).toHaveLength(6);

    // The kept assistant message for requestId1 should have 3 content blocks (thinking + text + tool_use)
    const keptAssistant1 = deduped.find(m => m.requestId === requestId1);
    expect(keptAssistant1).toBeDefined();
    expect(keptAssistant1!.contentBlocks).toHaveLength(3);
    expect(keptAssistant1!.contentBlocks[0].blockType).toBe('thinking');
    expect(keptAssistant1!.contentBlocks[1].blockType).toBe('text');
    expect(keptAssistant1!.contentBlocks[2].blockType).toBe('tool_use');
  });

  it('should produce a valid IngestPayload from parsed and deduped messages', () => {
    const { sessionId, lines } = buildRealisticSession();
    const data = lines.join('\n');

    const parsed = parseJsonlChunk(data, sessionId);
    const deduped = deduplicateMessages(parsed.messages);

    const session: SessionMetadata = {
      sessionId,
      projectPath: '/Users/test/project',
      projectSlug: '-Users-test-project',
      filePath: `/Users/test/.claude/projects/-Users-test-project/${sessionId}.jsonl`,
    };

    const payload: IngestPayload = {
      session,
      messages: deduped,
      fileOffset: parsed.bytesRead,
    };

    // Validate payload structure
    expect(payload.session.sessionId).toBe(sessionId);
    expect(payload.messages.length).toBeGreaterThan(0);
    expect(payload.fileOffset).toBeGreaterThan(0);

    // All messages should have required fields
    for (const msg of payload.messages) {
      expect(msg.id).toBeTruthy();
      expect(msg.sessionId).toBe(sessionId);
      expect(msg.type).toBeTruthy();
      expect(msg.timestamp).toBeTruthy();
      expect(typeof msg.isSidechain).toBe('boolean');
      expect(Array.isArray(msg.contentBlocks)).toBe(true);
    }
  });

  it('should correctly extract token usage from the final assistant message', () => {
    const { sessionId, requestId2, lines } = buildRealisticSession();
    const data = lines.join('\n');

    const parsed = parseJsonlChunk(data, sessionId);
    const deduped = deduplicateMessages(parsed.messages);

    const finalMsg = deduped.find(m => m.requestId === requestId2);
    expect(finalMsg).toBeDefined();
    expect(finalMsg!.inputTokens).toBe(1500);
    expect(finalMsg!.outputTokens).toBe(200);
    expect(finalMsg!.cacheCreationTokens).toBe(100);
    expect(finalMsg!.cacheReadTokens).toBe(50);
    expect(finalMsg!.stopReason).toBe('end_turn');
    expect(finalMsg!.model).toBe('claude-opus-4-5-20251101');
  });

  it('should correctly extract tool_use and tool_result content blocks', () => {
    const { sessionId, toolId, requestId1, lines } = buildRealisticSession();
    const data = lines.join('\n');

    const parsed = parseJsonlChunk(data, sessionId);
    const deduped = deduplicateMessages(parsed.messages);

    // Find the tool_use in assistant message
    const assistantWithTool = deduped.find(m => m.requestId === requestId1);
    const toolUseBlock = assistantWithTool!.contentBlocks.find(b => b.blockType === 'tool_use');
    expect(toolUseBlock).toBeDefined();
    expect(toolUseBlock!.toolUseId).toBe(toolId);
    expect(toolUseBlock!.toolName).toBe('Read');
    expect(toolUseBlock!.toolInput).toEqual({ file_path: '/src/auth.ts' });

    // Find the tool_result in user message
    const userToolResult = deduped.find(m => m.type === 'user' && m.contentBlocks.some(b => b.blockType === 'tool_result'));
    expect(userToolResult).toBeDefined();
    const resultBlock = userToolResult!.contentBlocks[0];
    expect(resultBlock.toolUseId).toBe(toolId);
    expect(resultBlock.toolResultContent).toContain('export function login');
    expect(resultBlock.toolResultIsError).toBe(false);
  });

  it('should handle an empty JSONL file gracefully', () => {
    const result = parseJsonlChunk('', uuid());
    expect(result.messages).toHaveLength(0);
    expect(result.bytesRead).toBe(0);
  });

  it('should handle a JSONL file with only skippable types', () => {
    const lines = [
      JSON.stringify({
        type: 'file-history-snapshot',
        messageId: uuid(),
        snapshot: { messageId: uuid(), trackedFileBackups: {}, timestamp: new Date().toISOString() },
      }),
      JSON.stringify({
        type: 'progress',
        uuid: uuid(),
        data: { type: 'hook_progress' },
        timestamp: new Date().toISOString(),
      }),
    ].join('\n');

    const result = parseJsonlChunk(lines, uuid());
    expect(result.messages).toHaveLength(0);
    expect(result.bytesRead).toBeGreaterThan(0);
  });
});
