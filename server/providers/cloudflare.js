import { HttpError } from '../lib/errors.js';
export async function cloudflare(transport, credential, body) {
  let saved;
  try {
    saved = JSON.parse(credential);
  } catch {
    throw new HttpError(409, 'Reconnect Cloudflare in Settings with your API token and Account ID');
  }
  if (
    !/^[a-fA-F0-9]{32}$/.test(saved?.account_id) ||
    typeof saved?.api_key !== 'string' ||
    !/^[\x21-\x7E]{8,512}$/.test(saved.api_key)
  )
    throw new HttpError(
      409,
      'Reconnect Cloudflare in Settings with a valid API token and Account ID',
    );
  const response = await transport.post(
    `https://api.cloudflare.com/client/v4/accounts/${saved.account_id}/ai/run/${body.model}`,
    { Authorization: `Bearer ${saved.api_key}` },
    { prompt: body.prompt, steps: 4 },
  );
  if (response.success === false)
    throw new HttpError(
      502,
      'Cloudflare could not generate an image. Check Workers AI status, account access, and daily allowance.',
    );
  if (typeof response.result?.image !== 'string' || !response.result.image)
    throw new HttpError(
      502,
      'Cloudflare returned no image. Try another prompt or check Workers AI status.',
    );
  return response.result.image;
}
