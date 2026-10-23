const auth = [{ ImageAPIKey: [] }, { SessionCookie: [] }];
const schema = (ref) => ({
  'application/json': { schema: { $ref: `#/components/schemas/${ref}` } },
});
const id = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string', pattern: '^poster_[a-f0-9]{24}$' },
};
export const posterPaths = {
  '/v1/posters/catalog': {
    get: {
      summary: 'Poster layouts, dimensions, fonts, and exports',
      security: auth,
      responses: { 200: { description: 'Poster catalog' } },
    },
  },
  '/v1/posters': {
    post: {
      summary: 'Queue an automated finished poster',
      security: auth,
      parameters: [
        {
          in: 'header',
          name: 'Idempotency-Key',
          schema: { type: 'string', minLength: 8, maxLength: 128 },
          description:
            'Unique per account and request content; reuse on network retries to avoid duplicate jobs.',
        },
      ],
      requestBody: { required: true, content: schema('PosterRequest') },
      responses: {
        202: { description: 'Accepted; poll the Location URL', content: schema('PosterJob') },
        200: { description: 'Idempotent replay of existing job', content: schema('PosterJob') },
        409: { description: 'Idempotency conflict or provider not connected' },
        422: {
          description: 'Invalid or unreadable copy, unsupported font character, unsafe webhook',
        },
        429: { description: 'Queue or submission rate limit' },
      },
    },
    get: {
      summary: 'List your poster jobs',
      security: auth,
      parameters: [
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        { in: 'query', name: 'offset', schema: { type: 'integer', minimum: 0, default: 0 } },
      ],
      responses: { 200: { description: 'Jobs, total, limit, and offset' } },
    },
  },
  '/v1/posters/{id}': {
    get: {
      summary: 'Read job status and fresh 15-minute download links',
      security: auth,
      parameters: [id],
      responses: {
        200: { description: 'Owned job', content: schema('PosterJob') },
        404: { description: 'Job not found' },
      },
    },
    delete: {
      summary: 'Cancel queued work or delete terminal job input and output',
      security: auth,
      parameters: [id],
      responses: {
        204: { description: 'Deleted; links revoked, idempotency tombstone retained' },
        409: { description: 'Running provider request cannot be safely cancelled' },
      },
    },
  },
  '/v1/posters/{id}/output/{format}': {
    get: {
      summary: 'Download your completed poster with authentication',
      security: auth,
      parameters: [
        id,
        {
          in: 'path',
          name: 'format',
          required: true,
          schema: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
        },
      ],
      responses: {
        200: { description: 'Binary final poster' },
        410: { description: 'Output unavailable or expired' },
      },
    },
  },
  '/v1/poster-files/{id}/{format}': {
    get: {
      summary: 'Download using a short-lived scoped capability',
      parameters: [
        id,
        {
          in: 'path',
          name: 'format',
          required: true,
          schema: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
        },
        { in: 'query', name: 'token', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Binary poster' },
        401: { description: 'Invalid or expired link' },
        410: { description: 'Deleted or expired output' },
      },
    },
  },
  '/v1/brands': {
    get: {
      summary: 'List your saved brand profiles',
      security: auth,
      responses: { 200: { description: 'Brand profiles including normalized base64 PNG logos' } },
    },
    post: {
      summary: 'Save a brand profile (maximum ten)',
      security: auth,
      requestBody: { required: true, content: schema('BrandProfile') },
      responses: {
        201: { description: 'Saved brand profile' },
        422: { description: 'Invalid fields or logo' },
      },
    },
  },
  '/v1/brands/{id}': {
    put: {
      summary: 'Replace your brand profile; existing jobs keep their snapshot',
      security: auth,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: schema('BrandProfile') },
      responses: { 200: { description: 'Saved profile' }, 404: { description: 'Brand not found' } },
    },
    delete: {
      summary: 'Delete your brand profile',
      security: auth,
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 204: { description: 'Deleted' }, 404: { description: 'Brand not found' } },
    },
  },
};
export const posterSchemas = {
  BrandProfile: {
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 60 },
      tagline: { type: 'string', maxLength: 120 },
      accent_color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$', default: '#2563eb' },
      background_color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$', default: '#f7f3eb' },
      font: { type: 'string', enum: ['sans', 'display', 'serif'], default: 'sans' },
      logo: {
        type: 'string',
        maxLength: 750000,
        description:
          'Optional base64 PNG/JPEG/WebP, no URLs or SVG; omit to clear when replacing a profile.',
      },
    },
  },
  PosterRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt', 'headline'],
    properties: {
      prompt: {
        type: 'string',
        minLength: 1,
        maxLength: 4000,
        description: 'Artwork direction only; typography is composed separately.',
      },
      headline: { type: 'string', minLength: 1, maxLength: 160 },
      subtitle: { type: 'string', maxLength: 260 },
      details: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', minLength: 1, maxLength: 120 },
      },
      cta: { type: 'string', maxLength: 48 },
      eyebrow: { type: 'string', maxLength: 48 },
      provider: {
        type: 'string',
        enum: ['cloudflare', 'openai', 'gemini', 'fal'],
        default: 'cloudflare',
      },
      model: {
        type: 'string',
        description: 'Supported provider model; defaults to provider default.',
      },
      layout: {
        type: 'string',
        enum: ['auto', 'editorial', 'minimal', 'bold', 'event', 'sale'],
        default: 'auto',
      },
      size: {
        type: 'string',
        enum: ['square', 'portrait', 'story', 'landscape', 'a4'],
        default: 'portrait',
      },
      brand_id: { type: 'string', pattern: '^brand_[a-f0-9]{24}$' },
      accent_color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
      font: { type: 'string', enum: ['sans', 'display', 'serif'] },
      format: { type: 'string', enum: ['png', 'jpeg', 'webp'], default: 'png' },
      retention_hours: { type: 'integer', minimum: 1, maximum: 168, default: 24 },
      webhook: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'secret'],
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            maxLength: 2048,
            description:
              'Public HTTPS endpoint on port 443. Redirects and private IPs are blocked.',
          },
          secret: { type: 'string', minLength: 24, maxLength: 200, writeOnly: true },
        },
      },
    },
  },
  PosterJob: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: {
        type: 'string',
        enum: ['queued', 'running', 'completed', 'failed', 'unknown', 'expired', 'deleted'],
      },
      stage: { type: 'string' },
      created_at: { type: 'integer' },
      updated_at: { type: 'integer' },
      expires_at: { type: 'integer' },
      request_id: { type: ['string', 'null'] },
      input: {
        type: 'object',
        description: 'Owned job input without webhook secret; removed on deletion/expiry.',
      },
      result: {
        type: ['object', 'null'],
        description:
          'Layout, palette, sizes, typography manifest, quality checks, format byte counts, and signed download links.',
      },
      error: { type: ['object', 'null'] },
      webhook: {
        type: 'object',
        properties: { status: { type: 'string' }, attempts: { type: 'integer' } },
      },
    },
  },
};
