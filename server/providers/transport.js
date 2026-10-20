import { fetch, EnvHttpProxyAgent } from 'undici';
import { HttpError } from '../lib/errors.js';
import { providerError } from './errors.js';
export function createTransport(config, fetchImpl) {
  const dispatcher = fetchImpl ? null : new EnvHttpProxyAgent();
  const request = fetchImpl || fetch;
  return {
    async post(url, headers, body) {
      const signal = AbortSignal.timeout(config.providerTimeout);
      let response;
      try {
        response = await request(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
          redirect: 'manual',
          signal,
          ...(dispatcher ? { dispatcher } : {}),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw providerError(response.status);
        }
        const advertised = Number(response.headers.get('content-length'));
        if (advertised > config.providerResponseLimit) {
          await response.body?.cancel();
          throw new HttpError(502, 'Provider response exceeds the size limit');
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > config.providerResponseLimit)
            throw new HttpError(502, 'Provider response exceeds the size limit');
          chunks.push(chunk);
        }
        try {
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new HttpError(502, 'Provider returned invalid JSON');
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (signal.aborted || ['TimeoutError', 'AbortError'].includes(error.name))
          throw new HttpError(
            504,
            'Image generation timed out. Check provider usage before retrying',
          );
        throw new HttpError(503, 'Could not connect to the image provider');
      }
    },
    close: async () => {
      await dispatcher?.close();
    },
  };
}
