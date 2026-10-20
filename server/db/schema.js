export const schema = `
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
