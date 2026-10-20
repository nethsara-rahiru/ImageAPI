import { HttpError } from '../lib/errors.js';
export async function fal(transport, key, body) {
  const [width, height] = body.size.split('x').map(Number);
  const result = await transport.post(
    `https://fal.run/${body.model}`,
    { Authorization: 'Key ' + key },
    {
      prompt: body.prompt,
      image_size: { width, height },
      num_images: 1,
      sync_mode: true,
      output_format: 'png',
    },
  );
  const uri = result.images?.[0]?.url;
  const match =
    typeof uri === 'string' && /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!match) throw new HttpError(502, 'Provider did not return inline image data');
  return match[1];
}
