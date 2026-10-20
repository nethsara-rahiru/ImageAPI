export const providers = {
  openai: {
    name: 'OpenAI',
    description: 'Detailed images and precise prompt following.',
    key_url: 'https://platform.openai.com/api-keys',
    models: ['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5'],
    default_model: 'gpt-image-1',
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    qualities: ['auto', 'low', 'medium', 'high'],
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Native image generation with Nano Banana.',
    key_url: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image'],
    default_model: 'gemini-2.5-flash-image',
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    qualities: ['auto'],
  },
  cloudflare: {
    name: 'Cloudflare Workers AI',
    description: 'FLUX Schnell with a daily free allowance from Cloudflare. Account limits apply.',
    key_url: 'https://developers.cloudflare.com/workers-ai/get-started/rest-api/',
    models: ['@cf/black-forest-labs/flux-1-schnell'],
    default_model: '@cf/black-forest-labs/flux-1-schnell',
    sizes: ['1024x1024'],
    qualities: ['auto'],
    prompt_limit: 2048,
    size_note: 'Native square output. Actual pixel dimensions are returned with the image.',
    requires_account_id: true,
  },
  fal: {
    name: 'FLUX · fal.ai',
    description: 'Fast, expressive images with FLUX models.',
    key_url: 'https://fal.ai/dashboard/keys',
    models: ['fal-ai/flux/schnell', 'fal-ai/flux/dev'],
    default_model: 'fal-ai/flux/schnell',
    sizes: ['1024x1024', '1536x1024', '1024x1536'],
    qualities: ['auto'],
  },
};
export const providerCatalog = () =>
  Object.entries(providers).map(([id, info]) => ({ id, ...info }));
