PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  cwd TEXT NOT NULL,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  resume_command TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  model TEXT,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO sessions (id, cwd, title, model, resume_command, created_at)
VALUES (
  'opencode-thread-synthetic-001',
  '/workspace/synthetic-opencode',
  'Synthetic OpenCode Session',
  'opencode-synthetic-model',
  'cd /workspace/synthetic-opencode && opencode --session opencode-thread-synthetic-001',
  '2026-01-02T03:10:00.000Z'
);

INSERT INTO messages (id, session_id, role, content, content_type, model, sequence, created_at)
VALUES
  (
    'opencode-message-synthetic-001',
    'opencode-thread-synthetic-001',
    'user',
    'Open the synthetic project and summarize fixture coverage.',
    'text/plain',
    NULL,
    1,
    '2026-01-02T03:10:01.000Z'
  ),
  (
    'opencode-message-synthetic-002',
    'opencode-thread-synthetic-001',
    'assistant',
    '{"type":"assistant_message","text":"OpenCode fixture stores cwd, thread id, model, and resume metadata.","toolCall":{"name":"bash","arguments":{"command":"printf synthetic-opencode-fixture"}}}',
    'application/json',
    'opencode-synthetic-model',
    2,
    '2026-01-02T03:10:02.000Z'
  ),
  (
    'opencode-message-synthetic-003',
    'opencode-thread-synthetic-001',
    'tool',
    '{"type":"tool_result","name":"bash","exitCode":0,"stdout":"synthetic-opencode-fixture\n"}',
    'application/json',
    NULL,
    3,
    '2026-01-02T03:10:03.000Z'
  );
