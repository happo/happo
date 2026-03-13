import { SignJWT } from 'jose';

const TOKEN_TTL_SECONDS = 5 * 60;
const TOKEN_REFRESH_BUFFER_SECONDS = 30;

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in seconds
}

const cache = new Map<string, CachedToken>();

function getCacheKey(apiKey: string, apiSecret: string): string {
  return `${apiKey}:${apiSecret}`;
}

export async function getSignedToken(apiKey: string, apiSecret: string): Promise<string> {
  const nowSeconds = Date.now() / 1000;
  const cached = cache.get(getCacheKey(apiKey, apiSecret));

  if (cached && cached.expiresAt - nowSeconds > TOKEN_REFRESH_BUFFER_SECONDS) {
    return cached.token;
  }

  const expiresAt = Math.floor(nowSeconds) + TOKEN_TTL_SECONDS;
  const encodedSecret = new TextEncoder().encode(apiSecret);
  const token = await new SignJWT({ key: apiKey })
    .setProtectedHeader({ alg: 'HS256', kid: apiKey })
    .setExpirationTime(expiresAt)
    .sign(encodedSecret);

  cache.set(getCacheKey(apiKey, apiSecret), { token, expiresAt });
  return token;
}

// Exported for use in tests
export function clearTokenCache(): void {
  cache.clear();
}
