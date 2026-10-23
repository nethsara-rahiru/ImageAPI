# Product campaign renderer sample

This speaker promotion was composed by ImageAPI's local asynchronous poster API, including exact headline text, offer badge, feature icons, colour treatment, and CTA.

The text-free speaker artwork is a fixture cropped from the earlier AI-generated concept shown in the conversation. It is not a live Cloudflare result. The fictional brand and discount are demo copy. The lossless WebP preserves the pixels of the PNG downloaded from the app. The JSON records source and quality-check provenance.

Run the same API/compositor flow with your own text-free artwork:

```bash
npm run poster:product-sample -- --background /path/to/product-art.png
```

The default sample uses a bundled vector speaker illustration without making a provider request. Actual deployed poster jobs use the user's saved provider key.
