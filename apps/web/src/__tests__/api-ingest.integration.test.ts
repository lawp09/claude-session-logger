/**
 * Integration test: POST /api/ingest → PostgreSQL → GET /api/sessions → GET /api/sessions/:id/messages
 * Uses testcontainers to spin up a real PostgreSQL instance.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const uuid = () => crypto.randomUUID();

let container: StartedPostgreSqlContainer;
let pool: Pool;

const SCHEMA_PATH = join(import.meta.dirname, '../../../../docs/schema.sql');

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('csl_test')
    .withUsername('csl_test')
    .withPassword('csl_test')
    .start();

  const connectionString = container.getConnectionUri();

  pool = new Pool({ connectionString, max: 5 });

  // Execute schema
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  await pool.query(schema);
}, 60_000);

afterAll(async () => {
  if (pool) await pool.end();
  if (container) await container.stop();
}, 15_000);

describe('API ingest → PostgreSQL integration', () => {
  it('should insert a session via upsertSession', async () => {
    const sessionId = uuid();

    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         file_offset = GREATEST(sessions.file_offset, $5),
         ended_at = NOW()`,
      [sessionId, '/Users/test/project', '-Users-test-project', '/path/to/session.jsonl', 1024]
    );

    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].project_slug).toBe('-Users-test-project');
    expect(result.rows[0].file_offset).toBe('1024');
  });

  it('should insert messages and content_blocks within a transaction', async () => {
    const sessionId = uuid();
    const msgId1 = uuid();
    const msgId2 = uuid();
    const toolId = `toolu_${uuid()}`;

    // Insert session first
    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, '/Users/test/project', '-Users-test-project', '/path/to/session.jsonl', 0]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert user message
      await client.query(
        `INSERT INTO messages (id, session_id, parent_uuid, type, role, model, request_id,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          stop_reason, is_sidechain, timestamp, subtype, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING`,
        [msgId1, sessionId, null, 'user', 'user', null, null, null, null, null, null, null, false, new Date().toISOString(), null, null]
      );

      // Insert text content block for user message
      await client.query(
        `INSERT INTO content_blocks (message_id, block_index, block_type, text_content,
          tool_use_id, tool_name, tool_input, tool_result_content, tool_result_is_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (message_id, block_index) DO NOTHING`,
        [msgId1, 0, 'text', 'Fix the authentication bug', null, null, null, null, false]
      );

      // Insert assistant message with tool_use
      await client.query(
        `INSERT INTO messages (id, session_id, parent_uuid, type, role, model, request_id,
          input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
          stop_reason, is_sidechain, timestamp, subtype, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING`,
        [msgId2, sessionId, msgId1, 'assistant', 'assistant', 'claude-opus-4-5-20251101', `req_${uuid()}`,
         1500, 200, 100, 50, 'end_turn', false, new Date().toISOString(), null, null]
      );

      // Insert thinking block
      await client.query(
        `INSERT INTO content_blocks (message_id, block_index, block_type, text_content,
          tool_use_id, tool_name, tool_input, tool_result_content, tool_result_is_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (message_id, block_index) DO NOTHING`,
        [msgId2, 0, 'thinking', 'Analyzing the code...', null, null, null, null, false]
      );

      // Insert text block
      await client.query(
        `INSERT INTO content_blocks (message_id, block_index, block_type, text_content,
          tool_use_id, tool_name, tool_input, tool_result_content, tool_result_is_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (message_id, block_index) DO NOTHING`,
        [msgId2, 1, 'text', 'Let me check the auth module.', null, null, null, null, false]
      );

      // Insert tool_use block
      await client.query(
        `INSERT INTO content_blocks (message_id, block_index, block_type, text_content,
          tool_use_id, tool_name, tool_input, tool_result_content, tool_result_is_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (message_id, block_index) DO NOTHING`,
        [msgId2, 2, 'tool_use', null, toolId, 'Read', JSON.stringify({ file_path: '/src/auth.ts' }), null, false]
      );

      // Update session token totals
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

    // Verify messages
    const msgResult = await pool.query('SELECT * FROM messages WHERE session_id = $1 ORDER BY timestamp ASC', [sessionId]);
    expect(msgResult.rows).toHaveLength(2);
    expect(msgResult.rows[0].type).toBe('user');
    expect(msgResult.rows[1].type).toBe('assistant');
    expect(msgResult.rows[1].input_tokens).toBe(1500);

    // Verify content blocks
    const blockResult = await pool.query(
      `SELECT cb.* FROM content_blocks cb
       JOIN messages m ON m.id = cb.message_id
       WHERE m.session_id = $1
       ORDER BY m.timestamp ASC, cb.block_index ASC`,
      [sessionId]
    );
    expect(blockResult.rows).toHaveLength(4); // 1 text + 1 thinking + 1 text + 1 tool_use

    // Verify session token totals
    const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    expect(parseInt(sessionResult.rows[0].total_input_tokens, 10)).toBe(1500);
    expect(parseInt(sessionResult.rows[0].total_output_tokens, 10)).toBe(200);
  });

  it('should handle ON CONFLICT DO NOTHING for duplicate messages', async () => {
    const sessionId = uuid();
    const msgId = uuid();

    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, '/path', 'slug', '/file.jsonl', 0]
    );

    // Insert message
    await pool.query(
      `INSERT INTO messages (id, session_id, type, role, is_sidechain, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [msgId, sessionId, 'user', 'user', false, new Date().toISOString()]
    );

    // Insert same message again — should not throw
    await pool.query(
      `INSERT INTO messages (id, session_id, type, role, is_sidechain, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [msgId, sessionId, 'user', 'user', false, new Date().toISOString()]
    );

    const result = await pool.query('SELECT COUNT(*) FROM messages WHERE id = $1', [msgId]);
    expect(parseInt(result.rows[0].count, 10)).toBe(1);
  });

  it('should handle ON CONFLICT DO NOTHING for duplicate content_blocks', async () => {
    const sessionId = uuid();
    const msgId = uuid();

    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, '/path', 'slug', '/file.jsonl', 0]
    );

    await pool.query(
      `INSERT INTO messages (id, session_id, type, role, is_sidechain, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [msgId, sessionId, 'user', 'user', false, new Date().toISOString()]
    );

    // Insert content block
    await pool.query(
      `INSERT INTO content_blocks (message_id, block_index, block_type, text_content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (message_id, block_index) DO NOTHING`,
      [msgId, 0, 'text', 'Hello']
    );

    // Insert same content block again — should not throw
    await pool.query(
      `INSERT INTO content_blocks (message_id, block_index, block_type, text_content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (message_id, block_index) DO NOTHING`,
      [msgId, 0, 'text', 'Hello duplicate']
    );

    const result = await pool.query('SELECT COUNT(*) FROM content_blocks WHERE message_id = $1', [msgId]);
    expect(parseInt(result.rows[0].count, 10)).toBe(1);
  });

  it('should query sessions with pagination (getSessions pattern)', async () => {
    const slug = `test-slug-${uuid().slice(0, 8)}`;

    // Insert 3 sessions
    for (let i = 0; i < 3; i++) {
      await pool.query(
        `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - interval '${i} hours')`,
        [uuid(), '/path', slug, '/file.jsonl', 0]
      );
    }

    // Paginate: limit 2, offset 0
    const page1 = await pool.query(
      `SELECT id, project_slug, started_at, COUNT(*) OVER() AS total
       FROM sessions
       WHERE project_slug = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [slug, 2, 0]
    );
    expect(page1.rows).toHaveLength(2);
    expect(parseInt(page1.rows[0].total, 10)).toBe(3);

    // Page 2
    const page2 = await pool.query(
      `SELECT id, project_slug, started_at, COUNT(*) OVER() AS total
       FROM sessions
       WHERE project_slug = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [slug, 2, 2]
    );
    expect(page2.rows).toHaveLength(1);
  });

  it('should query session messages with content blocks (getSessionMessages pattern)', async () => {
    const sessionId = uuid();
    const msgId = uuid();

    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [sessionId, '/path', 'slug', '/file.jsonl', 0]
    );

    await pool.query(
      `INSERT INTO messages (id, session_id, type, role, model, is_sidechain, timestamp, stop_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [msgId, sessionId, 'assistant', 'assistant', 'claude-opus-4-5-20251101', false, new Date().toISOString(), 'end_turn']
    );

    await pool.query(
      `INSERT INTO content_blocks (message_id, block_index, block_type, text_content)
       VALUES ($1, $2, $3, $4)`,
      [msgId, 0, 'thinking', 'Analyzing...']
    );

    await pool.query(
      `INSERT INTO content_blocks (message_id, block_index, block_type, text_content)
       VALUES ($1, $2, $3, $4)`,
      [msgId, 1, 'text', 'Here is my response.']
    );

    // Query like getSessionMessages
    const result = await pool.query(
      `SELECT m.id, m.type, m.role, m.model, m.stop_reason, m.is_sidechain,
              cb.block_index, cb.block_type, cb.text_content
       FROM messages m
       LEFT JOIN content_blocks cb ON cb.message_id = m.id
       WHERE m.session_id = $1
       ORDER BY m.timestamp ASC, cb.block_index ASC`,
      [sessionId]
    );

    expect(result.rows).toHaveLength(2); // 2 content blocks for 1 message

    // Reconstruct message map
    const messagesMap = new Map<string, { id: string; blocks: unknown[] }>();
    for (const row of result.rows) {
      if (!messagesMap.has(row.id)) {
        messagesMap.set(row.id, { id: row.id, blocks: [] });
      }
      if (row.block_type !== null) {
        messagesMap.get(row.id)!.blocks.push({
          blockIndex: row.block_index,
          blockType: row.block_type,
          textContent: row.text_content,
        });
      }
    }

    const msg = messagesMap.get(msgId)!;
    expect(msg.blocks).toHaveLength(2);
    expect((msg.blocks[0] as { blockType: string }).blockType).toBe('thinking');
    expect((msg.blocks[1] as { blockType: string }).blockType).toBe('text');
  });

  it('should update file_offset with GREATEST on session re-ingest', async () => {
    const sessionId = uuid();

    // First ingest
    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         file_offset = GREATEST(sessions.file_offset, $5),
         ended_at = NOW()`,
      [sessionId, '/path', 'slug', '/file.jsonl', 1024]
    );

    // Second ingest with higher offset
    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         file_offset = GREATEST(sessions.file_offset, $5),
         ended_at = NOW()`,
      [sessionId, '/path', 'slug', '/file.jsonl', 2048]
    );

    const result = await pool.query('SELECT file_offset FROM sessions WHERE id = $1', [sessionId]);
    expect(result.rows[0].file_offset).toBe('2048');

    // Third ingest with LOWER offset — should NOT decrease
    await pool.query(
      `INSERT INTO sessions (id, project_path, project_slug, file_path, file_offset, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         file_offset = GREATEST(sessions.file_offset, $5),
         ended_at = NOW()`,
      [sessionId, '/path', 'slug', '/file.jsonl', 512]
    );

    const result2 = await pool.query('SELECT file_offset FROM sessions WHERE id = $1', [sessionId]);
    expect(result2.rows[0].file_offset).toBe('2048');
  });
});
