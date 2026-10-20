import { z } from '../lib/validation.js';
import { providers } from '../providers/catalog.js';
export const generationSchema = z
  .object({
    prompt: z.string().trim().min(1).max(12000),
    provider: z.enum(['openai', 'gemini', 'fal']).default('openai'),
    model: z.string().max(120).optional(),
    size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024'),
    quality: z.enum(['auto', 'low', 'medium', 'high']).default('auto'),
  })
  .strict()
  .transform((body) => ({ ...body, model: body.model ?? providers[body.provider].default_model }))
  .superRefine((body, ctx) => {
    const provider = providers[body.provider];
    if (!provider.models.includes(body.model))
      ctx.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Model is not supported by this provider; see /api/catalog',
      });
    if (!provider.qualities.includes(body.quality))
      ctx.addIssue({
        code: 'custom',
        path: ['quality'],
        message: 'This provider supports quality=auto only',
      });
  });
