import { HttpError } from '../lib/errors.js';
export async function openai(transport, key, body) {
  const result = await transport.post(
    'https://api.openai.com/v1/images/generations',
    { Authorization: 'Bearer ' + key },
    {
      model: body.model,
      prompt: body.prompt,
      size: body.size,
      quality: body.quality,
      n: 1,
      output_format: 'png',
    },
  );
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new HttpError(502, 'Provider returned no image. Try another prompt');
  return encoded;
}
