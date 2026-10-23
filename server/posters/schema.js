import { z } from '../lib/validation.js';
import { providers } from '../providers/catalog.js';
import { posterSizes, fonts } from './catalog.js';
export const colour = z
  .string()
  .regex(/^#[a-fA-F0-9]{6}$/, 'Use a six-digit hex colour, for example #38bdf8');
const text = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value),
      'Text contains unsupported control characters',
    );
export const brandSchema = z
  .object({
    name: text(60).min(1),
    tagline: text(120).default(''),
    accent_color: colour.default('#2563eb'),
    background_color: colour.default('#f7f3eb'),
    font: z.enum(fonts).default('sans'),
    logo: z.string().max(750000).optional(),
  })
  .strict();
export const posterSchema = z
  .object({
    prompt: text(4000).min(1),
    provider: z.enum(Object.keys(providers)).default('cloudflare'),
    model: z.string().max(120).optional(),
    headline: text(160).min(1),
    subtitle: text(260).default(''),
    details: z.array(text(120).min(1)).max(5).default([]),
    cta: text(48).default(''),
    eyebrow: text(48).default(''),
    layout: z.enum(['auto', 'editorial', 'bold', 'minimal', 'event', 'sale']).default('auto'),
    size: z.enum(Object.keys(posterSizes)).default('portrait'),
    accent_color: colour.optional(),
    font: z.enum(fonts).optional(),
    brand_id: z
      .string()
      .regex(/^brand_[a-f0-9]{24}$/)
      .optional(),
    format: z.enum(['png', 'jpeg', 'webp']).default('png'),
    retention_hours: z.number().int().min(1).max(168).default(24),
    webhook: z
      .object({ url: z.string().url().max(2048), secret: z.string().min(24).max(200) })
      .strict()
      .optional(),
  })
  .strict()
  .transform((body) => ({ ...body, model: body.model || providers[body.provider].default_model }))
  .superRefine((body, ctx) => {
    if (!providers[body.provider].models.includes(body.model))
      ctx.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Unsupported model for selected provider',
      });
  });
