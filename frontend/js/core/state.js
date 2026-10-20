// Credentials live only in memory. Authentication uses the HttpOnly server cookie.
export const state = { user: null, csrf: null, pendingSecrets: null };
export function setSession(data) {
  state.user = data?.user ?? null;
  state.csrf = data?.csrf ?? null;
}
