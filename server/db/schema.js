export const schema = `
CREATE TABLE IF NOT EXISTS brands (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 encrypted_profile TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS poster_jobs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
 idempotency_key TEXT, request_hash TEXT NOT NULL, encrypted_input TEXT,
 status TEXT NOT NULL, stage TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, usage_id TEXT REFERENCES usage(id) ON DELETE SET NULL,
 result_json TEXT, error_json TEXT, webhook_state TEXT NOT NULL DEFAULT 'none',
 webhook_attempts INTEGER NOT NULL DEFAULT 0, webhook_next_at INTEGER NOT NULL DEFAULT 0,
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS poster_job_queue ON poster_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS poster_job_account ON poster_jobs(user_id,created_at);

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
 plan TEXT NOT NULL DEFAULT 'free', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL,
 created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS provider_keys (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL,
 encrypted_key TEXT NOT NULL, hint TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id, provider)
);
CREATE TABLE IF NOT EXISTS usage (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
 provider TEXT NOT NULL, model TEXT NOT NULL, size TEXT NOT NULL,
 source TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
 duration_ms INTEGER NOT NULL DEFAULT 0, error_code TEXT
);
CREATE INDEX IF NOT EXISTS usage_account_date ON usage(user_id,created_at);
CREATE INDEX IF NOT EXISTS usage_status_date ON usage(status,created_at);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,resets_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(resets_at);
`;
