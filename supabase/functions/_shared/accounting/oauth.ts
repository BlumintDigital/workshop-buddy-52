import type { ProviderContext } from "./types.ts";
import { ProviderError, readJson } from "./util.ts";

/** Exchanges an authorisation code or refresh token at an OAuth 2 token endpoint (client secret sent as Basic auth). */
export async function tokenRequest(
  fetchFn: typeof fetch,
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  form: Record<string, string>,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetchFn(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
  });
  return await readJson(res, "Sign-in");
}

/**
 * A valid access token, refreshing it first when it expires within a minute.
 * Both QuickBooks and Xero rotate refresh tokens, so the new one is saved too.
 */
export async function freshAccessToken(ctx: ProviderContext, tokenUrl: string, clientIdEnv: string, clientSecretEnv: string): Promise<string> {
  const { secrets } = ctx;
  const expires = secrets.token_expires_at ? Date.parse(secrets.token_expires_at) : 0;
  if (secrets.access_token && expires - Date.now() > 60_000) return secrets.access_token;
  if (!secrets.refresh_token) throw new ProviderError("The connection has expired. Reconnect it in Settings → Integrations.");
  const clientId = ctx.env(clientIdEnv);
  const clientSecret = ctx.env(clientSecretEnv);
  if (!clientId || !clientSecret) throw new ProviderError(`${clientIdEnv} and ${clientSecretEnv} must be set on the server.`);
  let token;
  try {
    token = await tokenRequest(ctx.fetch, tokenUrl, clientId, clientSecret, { grant_type: "refresh_token", refresh_token: secrets.refresh_token });
  } catch (e) {
    throw new ProviderError(`The connection could not be renewed; reconnect it in Settings → Integrations. (${(e as Error).message})`);
  }
  const patch = {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? secrets.refresh_token,
    token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };
  Object.assign(ctx.secrets, patch);
  await ctx.saveSecrets(patch);
  return token.access_token;
}
