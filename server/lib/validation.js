import { z } from 'zod';
import { HttpError } from './errors.js';
export { z };
export function parse(schema, input, source = 'body') {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError(
      422,
      result.error.issues.map((issue) => ({
        loc: [source, ...issue.path],
        msg: issue.message,
        type: issue.code,
      })),
    );
  return result.data;
}
export const email = z.string().trim().toLowerCase().max(254).email();
export const password = z.string().min(1).max(128);
export const newPassword = z.string().min(12).max(128);
export const name = z.string().trim().min(1).max(80);
