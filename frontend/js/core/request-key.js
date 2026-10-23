// getRandomValues also works on HTTP origins; randomUUID requires a secure context.
export function requestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}
