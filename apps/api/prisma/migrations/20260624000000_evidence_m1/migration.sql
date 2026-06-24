CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE trace_event_kind AS ENUM (
  'USER_MESSAGE',
  'ASSISTANT_MESSAGE',
  'TOOL_EXECUTION',
  'SYSTEM'
);

CREATE TYPE operation_kind AS ENUM (
  'NONE',
  'SHELL',
  'FILE_READ',
  'FILE_WRITE',
  'FILE_PATCH',
  'FILE_DELETE',
  'SEARCH',
  'TEST',
  'BUILD',
  'TYPECHECK',
  'LINT',
  'GIT',
  'PACKAGE_CHANGE',
  'OTHER'
);

CREATE TYPE evidence_quality AS ENUM (
  'EXACT',
  'PARSED',
  'INFERRED',
  'UNKNOWN'
);

CREATE TYPE experience_build_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED'
);

CREATE TYPE experience_outcome AS ENUM (
  'SUCCEEDED',
  'FAILED',
  'PARTIAL',
  'UNKNOWN'
);

CREATE TYPE attempt_outcome AS ENUM (
  'SUCCEEDED',
  'FAILED',
  'PARTIAL',
  'UNVERIFIED'
);

CREATE TYPE attempt_evidence_role AS ENUM (
  'MUTATION',
  'VALIDATION',
  'OBSERVATION_BEFORE',
  'OBSERVATION_AFTER',
  'CONTEXT'
);

ALTER TABLE history_file
  ADD COLUMN trace_parser_version VARCHAR(80),
  ADD COLUMN evidence_extractor_version VARCHAR(80);

ALTER TABLE agent_session
  ADD COLUMN trace_revision INT NOT NULL DEFAULT 0,
  ADD COLUMN experience_build_status experience_build_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN experience_builder_version VARCHAR(80),
  ADD COLUMN experience_build_error TEXT,
  ADD COLUMN experience_requested_at TIMESTAMPTZ,
  ADD COLUMN experience_ready_at TIMESTAMPTZ,
  ADD COLUMN experience_processing_at TIMESTAMPTZ,
  ADD CONSTRAINT agent_session_trace_revision_non_negative CHECK (trace_revision >= 0);

CREATE TABLE agent_trace_event (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
  source_event_key VARCHAR(200) NOT NULL,
  seq_no INT NOT NULL,
  sub_seq_no INT NOT NULL DEFAULT 0,
  event_kind trace_event_kind NOT NULL,
  operation_kind operation_kind NOT NULL,
  occurred_at TIMESTAMPTZ,
  call_id VARCHAR(200),
  tool_name VARCHAR(100),
  pairing_quality evidence_quality NOT NULL,
  facts JSONB NOT NULL,
  path_tokens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_signatures TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  command_families TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  redacted_excerpt TEXT,
  raw_pointer JSONB,
  raw_content_sha256 VARCHAR(64),
  content_hash VARCHAR(64) NOT NULL,
  extractor_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_trace_event_seq_non_negative CHECK (seq_no >= 0),
  CONSTRAINT agent_trace_event_sub_seq_non_negative CHECK (sub_seq_no >= 0),
  CONSTRAINT agent_trace_event_session_source_event_key_key UNIQUE (session_id, source_event_key)
);

CREATE TABLE agent_experience (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
  episode_index INT NOT NULL,
  source_revision INT NOT NULL,
  start_seq INT NOT NULL,
  end_seq INT NOT NULL,
  kind VARCHAR(80) NOT NULL,
  title TEXT NOT NULL,
  task_text TEXT NOT NULL,
  template_summary TEXT NOT NULL,
  outcome experience_outcome NOT NULL,
  evidence_score DOUBLE PRECISION NOT NULL,
  evidence_level VARCHAR(40) NOT NULL,
  evidence_reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  repo_key VARCHAR(200),
  cwd TEXT,
  path_tokens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  symbol_tokens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_signatures TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  command_families TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  failed_attempt_count INT NOT NULL DEFAULT 0,
  successful_attempt_count INT NOT NULL DEFAULT 0,
  unverified_attempt_count INT NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL,
  search_document_version VARCHAR(80) NOT NULL,
  embedding vector(1024),
  embedding_model VARCHAR(100),
  embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  embedding_error TEXT,
  embedding_ready_at TIMESTAMPTZ,
  builder_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_experience_episode_index_non_negative CHECK (episode_index >= 0),
  CONSTRAINT agent_experience_source_revision_non_negative CHECK (source_revision >= 0),
  CONSTRAINT agent_experience_start_seq_non_negative CHECK (start_seq >= 0),
  CONSTRAINT agent_experience_end_seq_non_negative CHECK (end_seq >= 0),
  CONSTRAINT agent_experience_seq_bounds CHECK (end_seq >= start_seq),
  CONSTRAINT agent_experience_evidence_score_bounds CHECK (
    evidence_score >= 0 AND evidence_score <= 1
  ),
  CONSTRAINT agent_experience_failed_attempt_count_non_negative
    CHECK (failed_attempt_count >= 0),
  CONSTRAINT agent_experience_successful_attempt_count_non_negative
    CHECK (successful_attempt_count >= 0),
  CONSTRAINT agent_experience_unverified_attempt_count_non_negative
    CHECK (unverified_attempt_count >= 0),
  CONSTRAINT agent_experience_session_episode_revision_key
    UNIQUE (session_id, episode_index, source_revision)
);

CREATE TABLE agent_attempt (
  id BIGSERIAL PRIMARY KEY,
  experience_id BIGINT NOT NULL REFERENCES agent_experience(id) ON DELETE CASCADE,
  attempt_index INT NOT NULL,
  start_seq INT NOT NULL,
  end_seq INT NOT NULL,
  outcome attempt_outcome NOT NULL,
  outcome_confidence DOUBLE PRECISION NOT NULL,
  action_signature TEXT NOT NULL,
  action_tokens TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  affected_paths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  affected_symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  command_families TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_before TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_after TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT agent_attempt_index_non_negative CHECK (attempt_index >= 0),
  CONSTRAINT agent_attempt_start_seq_non_negative CHECK (start_seq >= 0),
  CONSTRAINT agent_attempt_end_seq_non_negative CHECK (end_seq >= 0),
  CONSTRAINT agent_attempt_seq_bounds CHECK (end_seq >= start_seq),
  CONSTRAINT agent_attempt_outcome_confidence_bounds CHECK (
    outcome_confidence >= 0 AND outcome_confidence <= 1
  ),
  CONSTRAINT agent_attempt_experience_attempt_index_key UNIQUE (experience_id, attempt_index)
);

CREATE TABLE agent_attempt_evidence (
  attempt_id BIGINT NOT NULL REFERENCES agent_attempt(id) ON DELETE CASCADE,
  trace_event_id BIGINT NOT NULL REFERENCES agent_trace_event(id) ON DELETE CASCADE,
  role attempt_evidence_role NOT NULL,
  ordinal INT NOT NULL,
  CONSTRAINT agent_attempt_evidence_pkey PRIMARY KEY (attempt_id, trace_event_id, role),
  CONSTRAINT agent_attempt_evidence_ordinal_non_negative CHECK (ordinal >= 0)
);

CREATE INDEX idx_agent_session_experience_build_status
  ON agent_session(experience_build_status);

CREATE INDEX idx_agent_trace_event_session_seq
  ON agent_trace_event(session_id, seq_no, sub_seq_no);
CREATE INDEX idx_agent_trace_event_event_kind
  ON agent_trace_event(event_kind);
CREATE INDEX idx_agent_trace_event_operation_kind
  ON agent_trace_event(operation_kind);
CREATE INDEX idx_agent_trace_event_path_tokens_gin
  ON agent_trace_event USING gin(path_tokens);
CREATE INDEX idx_agent_trace_event_error_codes_gin
  ON agent_trace_event USING gin(error_codes);

CREATE INDEX idx_agent_experience_session_revision
  ON agent_experience(session_id, source_revision);
CREATE INDEX idx_agent_experience_outcome
  ON agent_experience(outcome);
CREATE INDEX idx_agent_experience_repo_key
  ON agent_experience(repo_key);
CREATE INDEX idx_agent_experience_embedding_status
  ON agent_experience(embedding_status);
CREATE INDEX agent_experience_paths_gin
  ON agent_experience USING gin(path_tokens);
CREATE INDEX agent_experience_errors_gin
  ON agent_experience USING gin(error_signatures);
CREATE INDEX agent_experience_error_codes_gin
  ON agent_experience USING gin(error_codes);
CREATE INDEX agent_experience_search_text_trgm
  ON agent_experience USING gin(search_text gin_trgm_ops);
CREATE INDEX agent_experience_embedding_hnsw
  ON agent_experience
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding_status = 'ready' AND embedding IS NOT NULL;

CREATE INDEX idx_agent_attempt_outcome
  ON agent_attempt(outcome);
CREATE INDEX idx_agent_attempt_action_signature
  ON agent_attempt(action_signature);
CREATE INDEX agent_attempt_action_tokens_gin
  ON agent_attempt USING gin(action_tokens);

CREATE INDEX idx_agent_attempt_evidence_trace_event
  ON agent_attempt_evidence(trace_event_id);
CREATE INDEX idx_agent_attempt_evidence_role
  ON agent_attempt_evidence(role);
