import pool from './pool';

interface UpsertSessionParams {
  sessionId: string;
  projectPath: string;
  projectSlug: string;
  filePath: string;
  fileOffset: number;
}

export async function upsertSession(params: UpsertSessionParams): Promise<void> {
  const { sessionId, projectPath, projectSlug, filePath, fileOffset } = params;
  await pool.query(
    `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       file_offset = GREATEST(sessions.file_offset, $5),
       ended_at = NOW()`,
    [sessionId, projectPath, projectSlug, filePath, fileOffset]
  );
}

interface MessageRow {
  id: string;
  sessionId: string;
  parentUuid?: string;
  type: string;
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
  contentBlocks: ContentBlockRow[];
}

interface ContentBlockRow {
  blockIndex: number;
  blockType: string;
  textContent?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResultContent?: string;
  toolResultIsError?: boolean;
}

export async function insertMessages(messages: MessageRow[]): Promise<void> {
  if (messages.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const msg of messages) {
      await client.query(
        `INSERT INTO messages (id, session_id, parent_uuid, type, role, model, request_id,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          stop_reason, is_sidechain, timestamp, subtype, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING`,
        [
          msg.id, msg.sessionId, msg.parentUuid ?? null, msg.type, msg.role ?? null,
          msg.model ?? null, msg.requestId ?? null, msg.inputTokens ?? null,
          msg.outputTokens ?? null, msg.cacheCreationTokens ?? null,
          msg.cacheReadTokens ?? null, msg.stopReason ?? null, msg.isSidechain,
          msg.timestamp, msg.subtype ?? null, msg.durationMs ?? null,
        ]
      );

      for (const block of msg.contentBlocks) {
        await client.query(
          `INSERT INTO content_blocks (message_id, block_index, block_type, text_content,
            tool_use_id, tool_name, tool_input, tool_result_content, tool_result_is_error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            msg.id, block.blockIndex, block.blockType, block.textContent ?? null,
            block.toolUseId ?? null, block.toolName ?? null,
            block.toolInput ? JSON.stringify(block.toolInput) : null,
            block.toolResultContent ?? null, block.toolResultIsError ?? false,
          ]
        );
      }
    }

    // Update session token totals
    const sessionId = messages[0].sessionId;
    await client.query(
      `UPDATE sessions SET
        total_input_tokens = COALESCE((SELECT SUM(input_tokens) FROM messages WHERE session_id = $1), 0),
        total_output_tokens = COALESCE((SELECT SUM(output_tokens) FROM messages WHERE session_id = $1), 0),
        total_cache_creation_tokens = COALESCE((SELECT SUM(cache_creation_tokens) FROM messages WHERE session_id = $1), 0),
        total_cache_read_tokens = COALESCE((SELECT SUM(cache_read_tokens) FROM messages WHERE session_id = $1), 0)
       WHERE id = $1`,
      [sessionId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface GetSessionsParams {
  projectSlug?: string;
  limit?: number;
  offset?: number;
}

export async function getSessions(params: GetSessionsParams): Promise<{ sessions: Record<string, unknown>[]; total: number }> {
  const { projectSlug, limit = 50, offset = 0 } = params;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (projectSlug) {
    conditions.push(`project_slug = $${paramIndex++}`);
    values.push(projectSlug);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT id, project_slug, project_path, started_at, ended_at, status, summary,
            total_input_tokens, total_output_tokens, total_cache_creation_tokens, total_cache_read_tokens,
            COUNT(*) OVER() AS total
     FROM sessions
     ${where}
     ORDER BY started_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total, 10) : 0;
  const sessions = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    projectSlug: row.project_slug,
    projectPath: row.project_path,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    summary: row.summary,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCacheCreationTokens: row.total_cache_creation_tokens,
    totalCacheReadTokens: row.total_cache_read_tokens,
  }));

  return { sessions, total };
}

export async function getSessionMessages(sessionId: string): Promise<Record<string, unknown>[]> {
  const result = await pool.query(
    `SELECT m.id, m.parent_uuid, m.type, m.role, m.model, m.request_id,
            m.input_tokens, m.output_tokens, m.cache_creation_tokens, m.cache_read_tokens,
            m.stop_reason, m.is_sidechain, m.timestamp, m.subtype, m.duration_ms,
            cb.block_index, cb.block_type, cb.text_content, cb.tool_use_id,
            cb.tool_name, cb.tool_input, cb.tool_result_content, cb.tool_result_is_error
     FROM messages m
     LEFT JOIN content_blocks cb ON cb.message_id = m.id
     WHERE m.session_id = $1
     ORDER BY m.timestamp ASC, cb.block_index ASC`,
    [sessionId]
  );

  const messagesMap = new Map<string, Record<string, unknown>>();

  for (const row of result.rows) {
    if (!messagesMap.has(row.id)) {
      messagesMap.set(row.id, {
        id: row.id,
        parentUuid: row.parent_uuid,
        type: row.type,
        role: row.role,
        model: row.model,
        requestId: row.request_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheCreationTokens: row.cache_creation_tokens,
        cacheReadTokens: row.cache_read_tokens,
        stopReason: row.stop_reason,
        isSidechain: row.is_sidechain,
        timestamp: row.timestamp,
        subtype: row.subtype,
        durationMs: row.duration_ms,
        contentBlocks: [],
      });
    }

    if (row.block_type !== null) {
      const msg = messagesMap.get(row.id)!;
      (msg.contentBlocks as Record<string, unknown>[]).push({
        blockIndex: row.block_index,
        blockType: row.block_type,
        textContent: row.text_content,
        toolUseId: row.tool_use_id,
        toolName: row.tool_name,
        toolInput: row.tool_input,
        toolResultContent: row.tool_result_content,
        toolResultIsError: row.tool_result_is_error,
      });
    }
  }

  return Array.from(messagesMap.values());
}

export async function getSessionStats(sessionId: string): Promise<Record<string, unknown> | null> {
  const tokenResult = await pool.query(
    `SELECT
       COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
       COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
       COALESCE(SUM(cache_creation_tokens), 0) AS total_cache_creation_tokens,
       COALESCE(SUM(cache_read_tokens), 0) AS total_cache_read_tokens,
       COUNT(*) AS message_count,
       MIN(timestamp) AS first_message,
       MAX(timestamp) AS last_message
     FROM messages
     WHERE session_id = $1`,
    [sessionId]
  );

  if (tokenResult.rows.length === 0 || parseInt(tokenResult.rows[0].message_count, 10) === 0) {
    return null;
  }

  const stats = tokenResult.rows[0];

  const toolResult = await pool.query(
    `SELECT cb.block_type, cb.tool_name, COUNT(*) AS cnt
     FROM content_blocks cb
     JOIN messages m ON m.id = cb.message_id
     WHERE m.session_id = $1
     GROUP BY cb.block_type, cb.tool_name`,
    [sessionId]
  );

  let toolUseCount = 0;
  let thinkingCount = 0;
  const toolCounts = new Map<string, number>();

  for (const row of toolResult.rows) {
    const cnt = parseInt(row.cnt, 10);
    if (row.block_type === 'tool_use') {
      toolUseCount += cnt;
      if (row.tool_name) {
        toolCounts.set(row.tool_name, (toolCounts.get(row.tool_name) ?? 0) + cnt);
      }
    } else if (row.block_type === 'thinking') {
      thinkingCount += cnt;
    }
  }

  const topTools = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const firstMsg = new Date(stats.first_message).getTime();
  const lastMsg = new Date(stats.last_message).getTime();

  return {
    totalInputTokens: parseInt(stats.total_input_tokens, 10),
    totalOutputTokens: parseInt(stats.total_output_tokens, 10),
    totalCacheCreationTokens: parseInt(stats.total_cache_creation_tokens, 10),
    totalCacheReadTokens: parseInt(stats.total_cache_read_tokens, 10),
    messageCount: parseInt(stats.message_count, 10),
    toolUseCount,
    thinkingCount,
    durationMs: lastMsg - firstMsg,
    topTools,
  };
}
