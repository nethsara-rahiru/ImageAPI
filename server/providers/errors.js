import { HttpError } from '../lib/errors.js';
export function providerError(status) {
  if ([401, 403].includes(status))
    return new HttpError(424, 'Provider rejected your key or model access. Check it in Settings');
  if (status === 429)
    return new HttpError(
      429,
      'Provider quota or rate limit exceeded. Check your provider account',
      { 'Retry-After': '60' },
    );
  if ([400, 404, 422].includes(status))
    return new HttpError(
      400,
      'Provider rejected the prompt, model, or settings. Try different options',
    );
  return new HttpError(502, 'The image provider is temporarily unavailable');
}
