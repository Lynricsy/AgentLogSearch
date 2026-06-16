CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE source_preset AS ENUM (
  'codex',
  'claude_code',
  'pi_agent',
  'opencode',
  'generic'
);

CREATE TYPE parser_type AS ENUM (
  'codex_jsonl',
  'claude_jsonl',
  'pi_jsonl',
  'opencode_sqlite',
  'generic_jsonl',
  'generic_json',
  'generic_markdown'
);

CREATE TYPE source_reader_type AS ENUM (
  'file_glob',
  'sqlite'
);

CREATE TYPE agent_role AS ENUM (
  'system',
  'user',
  'assistant',
  'tool',
  'unknown'
);

CREATE TYPE parse_status AS ENUM (
  'pending',
  'processing',
  'ready',
  'failed'
);

CREATE TYPE scan_job_status AS ENUM (
  'queued',
  'running',
  'completed',
  'failed'
);

CREATE TYPE embedding_status AS ENUM (
  'pending',
  'processing',
  'ready',
  'failed'
);

CREATE TYPE embedding_job_status AS ENUM (
  'queued',
  'running',
  'completed',
  'failed'
);

CREATE TYPE embedding_job_requester AS ENUM (
  'process',
  'rebuild',
  'scheduler',
  'manual'
);

CREATE TABLE agent_source (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  source_preset source_preset NOT NULL,
  parser_type parser_type NOT NULL,
  reader_type source_reader_type NOT NULL,
  root_path TEXT NOT NULL,
  file_glob VARCHAR(200) NOT NULL DEFAULT '**/*',
  resume_template TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  scan_interval_seconds INT NOT NULL DEFAULT 300,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_source_scan_interval_positive CHECK (scan_interval_seconds > 0)
);

CREATE TABLE history_file (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES agent_source(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_hash VARCHAR(128),
  file_size BIGINT NOT NULL DEFAULT 0,
  modified_at TIMESTAMPTZ,
  last_scanned_at TIMESTAMPTZ,
  parse_status parse_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT history_file_size_non_negative CHECK (file_size >= 0),
  CONSTRAINT history_file_source_path_key UNIQUE (source_id, file_path)
);

CREATE TABLE agent_session (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES agent_source(id) ON DELETE CASCADE,
  history_file_id BIGINT REFERENCES history_file(id) ON DELETE SET NULL,
  agent_name VARCHAR(100) NOT NULL,
  external_thread_id VARCHAR(200) NOT NULL,
  title TEXT,
  cwd TEXT,
  model_name VARCHAR(100),
  started_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INT NOT NULL DEFAULT 0,
  resume_command TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_session_message_count_non_negative CHECK (message_count >= 0),
  CONSTRAINT agent_session_source_thread_key UNIQUE (source_id, external_thread_id)
);

CREATE TABLE agent_message (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
  seq_no INT NOT NULL,
  role agent_role NOT NULL,
  content TEXT NOT NULL,
  model VARCHAR(100),
  created_at TIMESTAMPTZ,
  CONSTRAINT agent_message_seq_non_negative CHECK (seq_no >= 0),
  CONSTRAINT agent_message_session_seq_key UNIQUE (session_id, seq_no)
);

CREATE TABLE agent_chunk (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES agent_source(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  start_message_seq INT,
  end_message_seq INT,
  agent_name VARCHAR(100),
  external_thread_id VARCHAR(200),
  cwd TEXT,
  chunk_text TEXT NOT NULL,
  token_count INT,
  embedding vector(1024),
  embedding_model VARCHAR(100),
  embedding_status embedding_status NOT NULL DEFAULT 'pending',
  embedding_error TEXT,
  embedding_requested_at TIMESTAMPTZ,
  embedding_ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_chunk_index_non_negative CHECK (chunk_index >= 0),
  CONSTRAINT agent_chunk_start_seq_non_negative CHECK (
    start_message_seq IS NULL OR start_message_seq >= 0
  ),
  CONSTRAINT agent_chunk_end_seq_non_negative CHECK (
    end_message_seq IS NULL OR end_message_seq >= 0
  ),
  CONSTRAINT agent_chunk_token_count_non_negative CHECK (
    token_count IS NULL OR token_count >= 0
  ),
  CONSTRAINT agent_chunk_session_index_key UNIQUE (session_id, chunk_index)
);

CREATE TABLE scan_job (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES agent_source(id) ON DELETE SET NULL,
  status scan_job_status NOT NULL,
  files_discovered INT NOT NULL DEFAULT 0,
  files_parsed INT NOT NULL DEFAULT 0,
  files_failed INT NOT NULL DEFAULT 0,
  sessions_imported INT NOT NULL DEFAULT 0,
  messages_imported INT NOT NULL DEFAULT 0,
  chunks_created INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT scan_job_files_discovered_non_negative CHECK (files_discovered >= 0),
  CONSTRAINT scan_job_files_parsed_non_negative CHECK (files_parsed >= 0),
  CONSTRAINT scan_job_files_failed_non_negative CHECK (files_failed >= 0),
  CONSTRAINT scan_job_sessions_imported_non_negative CHECK (sessions_imported >= 0),
  CONSTRAINT scan_job_messages_imported_non_negative CHECK (messages_imported >= 0),
  CONSTRAINT scan_job_chunks_created_non_negative CHECK (chunks_created >= 0)
);

CREATE TABLE embedding_job (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES agent_source(id) ON DELETE SET NULL,
  status embedding_job_status NOT NULL DEFAULT 'queued',
  requested_by embedding_job_requester NOT NULL,
  total_chunks INT NOT NULL DEFAULT 0,
  processed_chunks INT NOT NULL DEFAULT 0,
  failed_chunks INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT embedding_job_total_chunks_non_negative CHECK (total_chunks >= 0),
  CONSTRAINT embedding_job_processed_chunks_non_negative CHECK (processed_chunks >= 0),
  CONSTRAINT embedding_job_failed_chunks_non_negative CHECK (failed_chunks >= 0),
  CONSTRAINT embedding_job_progress_bounds CHECK (
    processed_chunks + failed_chunks <= total_chunks
  )
);

CREATE INDEX idx_agent_source_enabled ON agent_source(enabled);
CREATE INDEX idx_history_file_source ON history_file(source_id);
CREATE INDEX idx_history_file_parse_status ON history_file(parse_status);
CREATE INDEX idx_agent_session_source ON agent_session(source_id);
CREATE INDEX idx_agent_session_thread ON agent_session(external_thread_id);
CREATE INDEX idx_agent_session_updated ON agent_session(updated_at);
CREATE INDEX idx_agent_session_last_message ON agent_session(last_message_at);
CREATE INDEX idx_agent_message_session_seq ON agent_message(session_id, seq_no);
CREATE INDEX idx_agent_chunk_session ON agent_chunk(session_id);
CREATE INDEX idx_agent_chunk_source ON agent_chunk(source_id);
CREATE INDEX idx_agent_chunk_agent_name ON agent_chunk(agent_name);
CREATE INDEX idx_agent_chunk_embedding_status ON agent_chunk(embedding_status);
CREATE INDEX idx_agent_chunk_source_embedding_status
  ON agent_chunk(source_id, embedding_status);
CREATE INDEX idx_agent_chunk_embedding_hnsw
  ON agent_chunk
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_scan_job_source ON scan_job(source_id);
CREATE INDEX idx_scan_job_status ON scan_job(status);
CREATE INDEX idx_scan_job_created ON scan_job(created_at);
CREATE INDEX idx_embedding_job_source ON embedding_job(source_id);
CREATE INDEX idx_embedding_job_status ON embedding_job(status);
CREATE INDEX idx_embedding_job_created ON embedding_job(created_at);
