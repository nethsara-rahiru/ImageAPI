// Read a small diagnostic body, never forward raw provider messages or credentials.
export async function errorPayload(response, limit = 16 * 1024) {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return undefined;
      chunks.push(value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // Classification uses only allowlisted codes/types, never the raw message.
    return {
      error: {
        code: typeof payload?.error?.code === 'string' ? payload.error.code : undefined,
        type: typeof payload?.error?.type === 'string' ? payload.error.type : undefined,
        reasons: Array.isArray(payload?.error?.details)
          ? payload.error.details
              .slice(0, 20)
              .map((detail) => detail?.reason)
              .filter((reason) => typeof reason === 'string')
          : [],
      },
    };
  } catch {
    return undefined;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* The body may already be closed. */
    }
  }
}
