import { SignJWT } from 'jose';

const TOKEN_TTL_SECONDS = 5 * 60;
const TOKEN_REFRESH_BUFFER_SECONDS = 30;

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in seconds
}

const cache = new Map<string, Promise<CachedToken>>();

function getCacheKey(apiKey: string, apiSecret: string): string {
  return `${apiKey}:${apiSecret}`;
}

export async function getSignedToken(apiKey: string, apiSecret: string): Promise<string> {
  const cacheKey = getCacheKey(apiKey, apiSecret);
  const cachedPromise = cache.get(cacheKey);

  if (cachedPromise) {
    const cached = await cachedPromise;
    const nowSeconds = Date.now() / 1000;
    if (cached.expiresAt - nowSeconds > TOKEN_REFRESH_BUFFER_SECONDS) {
      return cached.token;
    }
  }

  const signingPromise = (async (): Promise<CachedToken> => {
    const nowSeconds = Date.now() / 1000;
    const expiresAt = Math.floor(nowSeconds) + TOKEN_TTL_SECONDS;
    const encodedSecret = new TextEncoder().encode(apiSecret);
    const token = await new SignJWT({ key: apiKey })
      .setProtectedHeader({ alg: 'HS256', kid: apiKey })
      .setExpirationTime(expiresAt)
      .sign(encodedSecret);
    return { token, expiresAt };
  })();

  cache.set(cacheKey, signingPromise);
  try {
    const { token } = await signingPromise;
    return token;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

// Exported for use in tests
export function clearTokenCache(): void {
  cache.clear();
}
