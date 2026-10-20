import { HttpError } from '../lib/errors.js';

const openaiCodes = {
  credit_balance_exhausted:
    'OpenAI reports no prepaid API credits remaining. Check the API billing balance for the organization that owns this key.',
  organization_usage_limit_exceeded:
    'OpenAI reports that this organization reached its approved API usage limit. Review the organization Limits page or request a higher limit.',
  organization_spend_limit_exceeded:
    'OpenAI reports that this organization reached its enforced API spending limit. Review the organization spend limit.',
  project_spend_limit_exceeded:
    'OpenAI reports that this key’s project reached its enforced API spending limit. Review that project’s spend limit.',
  billing_hard_limit_reached:
    'OpenAI reports an API billing limit. Check API billing, available credits, and spending limits for this key’s project and organization.',
  billing_not_active:
    'OpenAI reports that API billing is not active for this key’s account. Check API billing settings.',
  insufficient_quota:
    'OpenAI reports insufficient API quota. Check API credits, billing, and the project/organization limits for this key.',
};
const rateCodes = new Set(['rate_limit_exceeded', 'rate_limit_error', 'slow_down']);

function retryAfter(headers) {
  const value = headers?.get('retry-after');
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Math.ceil(Number(value));
    return seconds > 0 && seconds <= 86400 ? String(seconds) : null;
  }
  const seconds = Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return seconds > 0 && seconds <= 86400 ? String(seconds) : null;
}

export function providerError(status, { provider = 'provider', payload, headers } = {}) {
  const code = payload?.error?.code;
  const type = payload?.error?.type;
  const name = provider === 'openai' ? 'OpenAI' : 'Provider';
  let error;
  if (provider === 'openai' && [400, 429].includes(status)) {
    // Specific codes take precedence over OpenAI's broader insufficient_quota type.
    const recognized =
      Object.hasOwn(openaiCodes, code) || rateCodes.has(code)
        ? code
        : Object.hasOwn(openaiCodes, type) || rateCodes.has(type)
          ? type
          : null;
    if (Object.hasOwn(openaiCodes, recognized)) {
      error = new HttpError(
        429,
        `${openaiCodes[recognized]} ImageAPI’s monthly allowance is separate. (${recognized})`,
      );
      error.providerCode = recognized;
    } else if (rateCodes.has(recognized)) {
      const delay = retryAfter(headers);
      error = new HttpError(
        429,
        `OpenAI temporarily rate-limited this model or project. ${delay ? `Wait at least ${delay} seconds before retrying.` : 'Pause before retrying and check the model’s rate limits.'} This is separate from ImageAPI’s monthly allowance. (${recognized})`,
        delay ? { 'Retry-After': delay } : {},
      );
      error.providerCode = recognized;
    }
  }
  if (!error) {
    if ([401, 403].includes(status))
      error = new HttpError(424, `${name} rejected your key or model access. Check it in Settings`);
    else if (status === 429)
      error = new HttpError(
        429,
        `${name} returned HTTP 429. This can be an API credit, usage/spend limit, or temporary rate limit. Check the provider account; ImageAPI’s monthly allowance is separate.`,
      );
    else if ([400, 404, 422].includes(status))
      error = new HttpError(
        400,
        'Provider rejected the prompt, model, or settings. Try different options',
      );
    else error = new HttpError(502, 'The image provider is temporarily unavailable');
  }
  const requestId = headers?.get('x-request-id');
  if (requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId))
    error.headers['X-Provider-Request-ID'] = requestId;
  return error;
}
