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
  const name =
    { openai: 'OpenAI', gemini: 'Google Gemini', fal: 'fal.ai', cloudflare: 'Cloudflare' }[
      provider
    ] || 'Provider';
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
    const hints =
      provider === 'openai'
        ? {
            invalid_api_key:
              'The saved OpenAI API key is invalid or revoked. Replace it in Settings with a key from the intended OpenAI API project.',
            model_not_found:
              'This OpenAI model does not exist or is unavailable to this API project. Check the selected model and project access.',
            unsupported_country_region_territory:
              'OpenAI does not support requests from this server’s country or region.',
          }
        : provider === 'gemini'
          ? {
              API_KEY_INVALID:
                'Google rejected the saved Gemini API key. Replace it in Settings with a Gemini API key for the intended project.',
              API_KEY_SERVICE_BLOCKED:
                'Google API key restrictions block the Gemini API. Review API restrictions for this key.',
              API_KEY_HTTP_REFERRER_BLOCKED:
                'Google rejected this server request because the key has browser referrer restrictions. Use a key configured for server requests.',
              API_KEY_IP_ADDRESS_BLOCKED:
                'Google API key restrictions do not allow this VPS IP address. Review the key’s allowed server IPs.',
              SERVICE_DISABLED:
                'The Gemini API is disabled for this Google project. Enable the Generative Language API in that project.',
            }
          : {};
    const recognized = [code, ...(payload?.error?.reasons || [])].find((value) =>
      Object.hasOwn(hints, value),
    );
    if (recognized && [400, 401, 403, 404].includes(status)) {
      error = new HttpError(424, `${hints[recognized]} (${recognized}; HTTP ${status})`);
      error.providerCode = recognized;
    } else if (status === 401)
      error = new HttpError(
        424,
        `${name} rejected authentication (HTTP 401). Replace the saved ${name} key in Settings; use that provider’s API key, not your ImageAPI key.`,
      );
    else if (status === 403 && provider === 'cloudflare')
      error = new HttpError(
        424,
        'Cloudflare denied this request (HTTP 403). Check the saved Account ID and use a token with Workers AI Read and Edit permissions for that account. Review any token IP restrictions.',
      );
    else if (status === 403)
      error = new HttpError(
        424,
        `${name} denied this request (HTTP 403). Check the selected model’s permissions, account eligibility, and API key restrictions for this VPS. A 403 alone does not establish that the key is invalid.`,
      );
    else if (status === 429)
      error = new HttpError(
        429,
        `${name} returned HTTP 429. This can be an API credit, usage/spend limit, or temporary rate limit. Check the provider account; ImageAPI’s monthly allowance is separate.`,
      );
    else if ([400, 404, 422].includes(status))
      error = new HttpError(
        400,
        `${name} rejected the prompt, model, or settings (HTTP ${status}). Check the selected model and options.`,
      );
    else error = new HttpError(502, 'The image provider is temporarily unavailable');
  }
  const requestId = headers?.get('x-request-id');
  if (requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId))
    error.headers['X-Provider-Request-ID'] = requestId;
  return error;
}
