import { openai } from './openai.js';
import { gemini } from './gemini.js';
import { fal } from './fal.js';
import { normalizeImage } from '../services/images.js';
import { HttpError } from '../lib/errors.js';
const adapters = { openai, gemini, fal };
export function createGenerator(transport, config) {
  return async (key, body) => {
    try {
      return await normalizeImage(await adapters[body.provider](transport, key, body), config);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'Provider returned invalid image data');
    }
  };
}
