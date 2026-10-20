import { Router } from 'express';
import multer from 'multer';
import { imageAuth } from '../auth/middleware.js';
import { parse, z } from '../lib/validation.js';
import { rateLimit } from '../services/rate-limit.js';
import { providerKey } from '../services/provider-keys.js';
import { generationSchema } from '../services/generation-schema.js';
import { reserve, finish } from '../services/usage.js';
import { transformImage } from '../services/images.js';
import { HttpError } from '../lib/errors.js';
export function images(ctx) {
  const router = Router();
  router.use(imageAuth(ctx));
  router.post(['/generations', '/generate'], async (req, res) => {
    const body = parse(generationSchema, req.body);
    rateLimit(ctx, 'generation:' + req.auth.userId, 20, 60);
    const key = providerKey(ctx, req.auth.userId, body.provider);
    const requestId = reserve(ctx, req.auth, body);
    const started = performance.now();
    res.set('X-Request-ID', requestId);
    let image;
    try {
      image = await ctx.generateImage(key, body);
    } catch (error) {
      finish(ctx, requestId, 'failed', performance.now() - started, String(error.status || 500));
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, 'Generation failed unexpectedly');
    }
    finish(ctx, requestId, 'success', performance.now() - started);
    res.json({
      id: requestId,
      created: ctx.now(),
      provider: body.provider,
      model: body.model,
      data: [
        {
          b64_json: image.encoded,
          mime_type: 'image/png',
          width: image.width,
          height: image.height,
        },
      ],
    });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ctx.config.uploadLimit, files: 1, fields: 0, parts: 1 },
  }).single('file');
  router.post(
    '/transform',
    (req, res, next) => {
      rateLimit(ctx, 'transform:' + req.auth.userId, 30, 60);
      next();
    },
    upload,
    async (req, res) => {
      const options = parse(
        z.object({
          width: z.coerce.number().int().min(1).max(4096).optional(),
          height: z.coerce.number().int().min(1).max(4096).optional(),
          format: z.enum(['jpeg', 'png', 'webp']).default('webp'),
          quality: z.coerce.number().int().min(1).max(100).default(85),
        }),
        req.query,
        'query',
      );
      if (!req.file) throw new HttpError(422, 'Upload an image in the file field');
      const result = await transformImage(req.file.buffer, options, ctx.config);
      res
        .set({
          'Content-Type': `image/${options.format}`,
          'Content-Disposition': `inline; filename="image.${options.format}"`,
          'X-Image-Width': String(result.info.width),
          'X-Image-Height': String(result.info.height),
        })
        .send(result.data);
    },
  );
  return router;
}
