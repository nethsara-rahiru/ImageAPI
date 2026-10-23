import { downloadToken } from './storage.js';
export function jobView(ctx, row) {
  const result = row.result_json ? JSON.parse(row.result_json) : null;
  const job = {
    id: row.id,
    status: row.status,
    stage: row.stage,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
    request_id: row.usage_id,
    webhook: { status: row.webhook_state, attempts: row.webhook_attempts },
    result: null,
    error: row.error_json ? JSON.parse(row.error_json) : null,
  };
  if (row.encrypted_input) {
    const { body, brand } = JSON.parse(ctx.encryption.decrypt(row.encrypted_input));
    const { webhook, ...input } = body;
    job.input = { ...input, brand_name: brand?.name || null };
    if (webhook) job.webhook.url = webhook.url;
  }
  if (row.status === 'completed' && result) {
    job.result = {
      ...result,
      downloads: Object.fromEntries(
        ['png', 'jpeg', 'webp'].map((format) => [format, downloadToken(ctx, row, format)]),
      ),
    };
  }
  return job;
}
