import { HttpError } from '../lib/errors.js';
export async function gemini(transport, key, body) {
  const aspect = { '1024x1024': '1:1', '1536x1024': '3:2', '1024x1536': '2:3' }[body.size];
  const result = await transport.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent`,
    { 'x-goog-api-key': key },
    {
      contents: [{ parts: [{ text: body.prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: aspect },
      },
    },
  );
  for (const candidate of result.candidates || [])
    for (const part of candidate.content?.parts || [])
      if (part.inlineData?.data) return part.inlineData.data;
  throw new HttpError(
    422,
    'Provider returned no image. The prompt may have been filtered; try a different prompt',
  );
}
