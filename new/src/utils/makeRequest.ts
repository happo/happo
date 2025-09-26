import asyncRetry from 'async-retry';
import FormData from 'form-data';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SignJWT } from 'jose';

import packageJson from '../../package.json' with { type: 'json' };
const { version } = packageJson;

// Type definitions
interface FormDataValue {
  value: any;
  options?: any;
}

interface RequestAttributes {
  url: string;
  method?: string;
  formData?: Record<string, any>;
  body?: any;
  json?: boolean;
  [key: string]: any;
}

interface MakeRequestOptions {
  apiKey: string;
  apiSecret: string;
  retryCount?: number;
  timeout?: number;
  retryMinTimeout?: number;
  retryMaxTimeout?: number;
  maxTries?: number;
}

function prepareFormData(data: Record<string, any>): FormData | undefined {
  if (!data) {
    return;
  }
  const form = new FormData();
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (typeof value === 'object' && value && 'options' in value) {
      // We have a file
      form.append(
        key,
        (value as FormDataValue).value,
        (value as FormDataValue).options,
      );
    } else {
      form.append(key, value);
    }
  }
  return form;
}

export default async function makeRequest(
  requestAttributes: RequestAttributes,
  {
    apiKey,
    apiSecret,
    retryCount = 0,
    timeout = 60_000,
    retryMinTimeout,
    retryMaxTimeout,
  }: MakeRequestOptions,
  { HTTP_PROXY }: { HTTP_PROXY?: string } = process.env,
): Promise<any> {
  const { url, method = 'GET', formData, body: jsonBody } = requestAttributes;

  const retryOpts: any = {
    onRetry: (error: Error) => {
      console.warn(
        `Failed ${method} ${url}. Retrying (at ${new Date().toISOString()}) ...`,
      );
      console.warn(error);
    },
  };

  if (retryCount != null) {
    retryOpts.retries = retryCount;
  }
  if (retryMinTimeout != null) {
    retryOpts.minTimeout = retryMinTimeout;
  }
  if (retryMaxTimeout != null) {
    retryOpts.maxTimeout = retryMaxTimeout;
  }

  const encodedSecret = new TextEncoder().encode(apiSecret);
  // https://github.com/panva/jose/blob/main/docs/classes/jwt_sign.SignJWT.md
  const signed = await new SignJWT({ key: apiKey })
    .setProtectedHeader({ alg: 'HS256', kid: apiKey })
    .sign(encodedSecret);

  return asyncRetry(async () => {
    const start = Date.now();

    // We must avoid reusing FormData instances when retrying requests
    // because they are consumed and cannot be reused.
    // More info: https://github.com/node-fetch/node-fetch/issues/1743
    const body = formData
      ? prepareFormData(formData)
      : jsonBody
        ? JSON.stringify(jsonBody)
        : undefined;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${signed}`,
      'User-Agent': `happo.io@${version}`,
    };

    if (jsonBody) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, {
        headers,
        compress: true,
        agent: HTTP_PROXY ? new HttpsProxyAgent(HTTP_PROXY) : undefined,
        signal: AbortSignal.timeout(timeout),
        ...requestAttributes,
        body,
      });

      if (!response.ok) {
        const error = new Error(
          `Request to ${method} ${url} failed: ${
            response.status
          } - ${await response.text()}`,
        ) as Error & { statusCode?: number };
        error.statusCode = response.status;
        throw error;
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      if (error.type === 'aborted') {
        error.message = `Timeout when fetching ${url} using method ${method}`;
      }
      error.message = `${error.message} (took ${Date.now() - start} ms)`;
      throw error;
    }
  }, retryOpts);
}
