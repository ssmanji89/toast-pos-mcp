import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import {
  createRateLimitAwareToastHttpClient,
  type RateLimitAwareToastHttpClientOptions,
} from "./rate-limited-client.js";
import { createServer } from "./server.js";

export interface ToastRuntime {
  readonly toastHttpClient: ReturnType<typeof createRateLimitAwareToastHttpClient>;
  readonly server: ReturnType<typeof createServer>;
}

/** Construct the one process-owned Standard transport and MCP server together. */
export function createRuntime(
  config: RuntimeConfig,
  tokenManager: OAuthTokenManager,
  options: RateLimitAwareToastHttpClientOptions = {},
): ToastRuntime {
  const toastHttpClient = createRateLimitAwareToastHttpClient(
    config,
    tokenManager,
    options,
  );
  return Object.freeze({
    toastHttpClient,
    server: createServer({ toastHttpClient }),
  });
}
