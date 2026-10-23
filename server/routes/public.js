import { Router } from 'express';
import { providerCatalog } from '../providers/catalog.js';
import { plans } from '../config/plans.js';
import { openapi } from '../config/openapi.js';
export function publicRoutes() {
  const router = Router();
  router.get('/health', (req, res) =>
    res.json({ status: 'ok', version: '2.0.0', runtime: 'node' }),
  );
  router.get('/api/catalog', (req, res) => res.json({ providers: providerCatalog() }));
  router.get('/api/plans', (req, res) =>
    res.json({
      plans,
      notice:
        'Free is available now. Paid prices and features are previews; subscriptions and payments are not enabled. Provider usage is billed separately by your provider.',
    }),
  );
  router.get('/api/reference', (req, res) => res.redirect('/docs'));
  router.get('/openapi.json', (req, res) => res.json(openapi));
  return router;
}
