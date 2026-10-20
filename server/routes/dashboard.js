import { Router } from 'express';
import { parse, z } from '../lib/validation.js';
import { sessionAuth } from '../auth/middleware.js';
import { dashboard } from '../services/dashboard.js';
export function dashboardRoutes(ctx) {
  const router = Router();
  router.get('/usage', sessionAuth(ctx), (req, res) => {
    const query = parse(
      z
        .object({
          page: z.coerce.number().int().min(1).max(100000).default(1),
          status: z.enum(['all', 'success', 'failed', 'pending', 'unknown']).default('all'),
        })
        .strict(),
      req.query,
      'query',
    );
    res.json(dashboard(ctx, req.auth.userId, query));
  });
  return router;
}
