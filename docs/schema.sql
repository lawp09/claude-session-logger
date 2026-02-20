-- Claude Session Logger - PostgreSQL 17 Schema
-- Migration UP

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    project_path TEXT NOT NULL,
    project_slug TEXT NOT NULL,
    git_branch TEXT,
    cwd TEXT,
    claude_version TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    summary TEXT,
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    total_cache_creation_tokens BIGINT DEFAULT 0,
    total_cache_read_tokens BIGINT DEFAULT 0,
    total_duration_ms BIGINT,
    status TEXT DEFAULT 'active',
    file_path TEXT NOT NULL,
    file_offset BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_slug ON sessions(project_slug);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_uuid UUID,
    type TEXT NOT NULL,
    role TEXT,
    model TEXT,
    request_id TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_creation_tokens INTEGER,
    cache_read_tokens INTEGER,
    stop_reason TEXT,
    is_sidechain BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMPTZ NOT NULL,
    subtype TEXT,
    duration_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_session_ts ON messages(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_request_id ON messages(request_id);

-- Content blocks table
CREATE TABLE IF NOT EXISTS content_blocks (
    id SERIAL PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    block_index SMALLINT NOT NULL,
    block_type TEXT NOT NULL,
    text_content TEXT,
    tool_use_id TEXT,
    tool_name TEXT,
    tool_input JSONB,
    tool_result_content TEXT,
    tool_result_is_error BOOLEAN DEFAULT FALSE,
    tool_use_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_blocks_msg_block ON content_blocks(message_id, block_index);
CREATE INDEX IF NOT EXISTS idx_content_blocks_message_id ON content_blocks(message_id);

-- Subagents table
CREATE TABLE IF NOT EXISTS subagents (
    id TEXT PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_type TEXT,
    prompt TEXT,
    status TEXT DEFAULT 'running',
    total_duration_ms BIGINT,
    total_tokens INTEGER,
    total_tool_use_count INTEGER,
    file_path TEXT,
    file_offset BIGINT DEFAULT 0,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subagents_session_id ON subagents(session_id);

-- Migration DOWN
-- DROP TABLE IF EXISTS subagents CASCADE;
-- DROP TABLE IF EXISTS content_blocks CASCADE;
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS sessions CASCADE;
