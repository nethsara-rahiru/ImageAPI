import { posterPaths, posterSchemas } from './poster-openapi.js';
const json = { 'application/json': { schema: { $ref: '#/components/schemas/GenerationRequest' } } };
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'ImageAPI',
    version: '2.1.0',
    description:
      'Node.js image generation with each account’s own provider keys. Browser sessions also require X-CSRF-Token on writes.',
  },
  paths: {
    ...posterPaths,
    '/health': {
      get: {
        summary: 'Process health (not provider readiness)',
        responses: { 200: { description: 'Healthy' } },
      },
    },
    '/api/catalog': {
      get: {
        summary: 'Supported providers, models, sizes, and qualities',
        responses: { 200: { description: 'Catalog' } },
      },
    },
    '/api/plans': {
      get: {
        summary: 'Free and preview pricing',
        responses: { 200: { description: 'Plan catalog' } },
      },
    },
    '/v1/images/generations': {
      post: {
        summary: 'Generate one PNG with your saved provider credential',
        security: [{ ImageAPIKey: [] }, { SessionCookie: [] }],
        requestBody: { required: true, content: json },
        responses: {
          200: {
            description: 'One base64-encoded PNG',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/GenerationResponse' } },
            },
          },
          400: { description: 'Provider rejected request' },
          401: { description: 'Invalid authentication' },
          409: { description: 'Connect provider key first' },
          422: { description: 'Invalid options or filtered prompt' },
          424: { description: 'Provider key or access rejected' },
          429: { description: 'Quota, rate, or concurrency limit' },
          502: { description: 'Provider failure' },
          504: { description: 'Timeout; provider may have charged' },
        },
      },
    },
    '/v1/images/transform': {
      post: {
        summary: 'Resize/convert an uploaded image without upscaling',
        security: [{ ImageAPIKey: [] }, { SessionCookie: [] }],
        parameters: [
          { in: 'query', name: 'width', schema: { type: 'integer', minimum: 1, maximum: 4096 } },
          { in: 'query', name: 'height', schema: { type: 'integer', minimum: 1, maximum: 4096 } },
          {
            in: 'query',
            name: 'format',
            schema: { type: 'string', enum: ['png', 'jpeg', 'webp'], default: 'webp' },
          },
          {
            in: 'query',
            name: 'quality',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 85 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Transformed binary image' },
          413: { description: 'Upload/pixel limit' },
          415: { description: 'Invalid or unsupported image' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ImageAPIKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'Your ia_live_… key. Keep it server-side.',
      },
      SessionCookie: { type: 'apiKey', in: 'cookie', name: 'imageapi_session' },
    },
    schemas: {
      ...posterSchemas,
      GenerationRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            minLength: 1,
            maxLength: 12000,
            description:
              'Cloudflare prompts are limited to 2048 characters; other providers allow 12000.',
          },
          provider: {
            type: 'string',
            enum: ['openai', 'gemini', 'fal', 'cloudflare'],
            default: 'openai',
          },
          model: {
            type: 'string',
            description: 'Model from /api/catalog; defaults to provider default',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '1536x1024', '1024x1536'],
            default: '1024x1024',
            description:
              'Cloudflare accepts native square output only (1024x1024); actual dimensions are returned in the response.',
          },
          quality: {
            type: 'string',
            enum: ['auto', 'low', 'medium', 'high'],
            default: 'auto',
            description: 'Non-auto qualities are OpenAI only',
          },
        },
      },
      GenerationResponse: {
        type: 'object',
        required: ['id', 'created', 'provider', 'model', 'data'],
        properties: {
          id: { type: 'string' },
          created: { type: 'integer' },
          provider: { type: 'string' },
          model: { type: 'string' },
          data: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: {
              type: 'object',
              required: ['b64_json', 'mime_type', 'width', 'height'],
              properties: {
                b64_json: { type: 'string', contentEncoding: 'base64' },
                mime_type: { type: 'string', const: 'image/png' },
                width: { type: 'integer' },
                height: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
};
