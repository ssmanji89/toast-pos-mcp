import { z } from "zod";

import {
  getRuntimeConfigCredentials,
  type RuntimeConfig,
} from "./config.js";

const AUTHENTICATION_LOGIN_PATH = "/authentication/v1/authentication/login";
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000;
const JWT_SEGMENT_COUNT = 3;
const MAX_SCOPE_LENGTH = 128;
const SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u;
const MAX_ACCEPTABLE_EXPIRES_IN_SECONDS = 86_400;

const toastTokenResponseSchema = z.object({
  token: z.object({
    tokenType: z.literal("Bearer"),
    expiresIn: z
      .number()
      .int()
      .positive()
      .max(MAX_ACCEPTABLE_EXPIRES_IN_SECONDS),
    accessToken: z.string().min(1),
  }),
});

const toastAccessTokenPayloadSchema = z
  .object({
    scope: z.union([z.string(), z.array(z.string())]),
  })
  .passthrough();

export type OAuthFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export interface OAuthTokenManagerOptions {
  readonly fetch?: OAuthFetch;
  readonly now?: () => number;
}

export type ToastAuthErrorCode =
  | "token_request_failed"
  | "token_request_network_error"
  | "token_response_invalid";

export class ToastAuthError extends Error {
  readonly code: ToastAuthErrorCode;
  readonly upstreamStatus: number | undefined;
  readonly upstreamRequestId: string | undefined;

  constructor(
    code: ToastAuthErrorCode,
    message: string,
    options: {
      readonly upstreamStatus?: number;
      readonly upstreamRequestId?: string;
    } = {},
  ) {
    super(message);
    this.name = "ToastAuthError";
    this.code = code;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamRequestId = options.upstreamRequestId;
  }
}

export class OAuthTokenManager {
  #cachedToken:
    | {
        readonly accessToken: string;
        readonly refreshAfterEpochMs: number;
      }
    | undefined;
  #config: RuntimeConfig;
  #fetch: OAuthFetch;
  #inFlightTokenRequest: Promise<string> | undefined;
  #now: () => number;

  constructor(
    config: RuntimeConfig,
    options: OAuthTokenManagerOptions = {},
  ) {
    this.#config = config;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string> {
    const cached = this.#cachedToken;
    if (
      cached !== undefined &&
      this.#now() < cached.refreshAfterEpochMs
    ) {
      return cached.accessToken;
    }

    if (this.#inFlightTokenRequest !== undefined) {
      return this.#inFlightTokenRequest;
    }

    const request = this.#requestAccessToken();
    this.#inFlightTokenRequest = request;

    try {
      return await request;
    } finally {
      if (this.#inFlightTokenRequest === request) {
        this.#inFlightTokenRequest = undefined;
      }
    }
  }

  async getAuthorizationHeader(): Promise<string> {
    return `Bearer ${await this.getAccessToken()}`;
  }

  /**
   * Return only the provisioned scope list from the current Toast-issued JWT.
   * The bearer token stays inside this owner; capability code never receives a
   * second raw token copy. Malformed/missing claims fail closed and sanitized.
   */
  async getProvisionedScopes(): Promise<readonly string[]> {
    return decodeProvisionedScopes(await this.getAccessToken());
  }

  async #requestAccessToken(): Promise<string> {
    const credentials = getRuntimeConfigCredentials(this.#config);
    let response: Response;

    try {
      response = await this.#fetch(
        `https://${this.#config.apiHostname}${AUTHENTICATION_LOGIN_PATH}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            userAccessType: this.#config.machineClientAccessType,
          }),
        },
      );
    } catch {
      throw new ToastAuthError(
        "token_request_network_error",
        "Toast authentication request failed before a response was received.",
      );
    }

    if (!response.ok) {
      throw new ToastAuthError(
        "token_request_failed",
        "Toast authentication denied the client-credentials token request.",
        buildAuthErrorMetadata(response),
      );
    }

    const payload = await readJson(response);
    const parsed = toastTokenResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ToastAuthError(
        "token_response_invalid",
        "Toast authentication returned an unusable token response.",
        buildAuthErrorMetadata(response),
      );
    }

    const token = parsed.data.token;
    this.#cachedToken = {
      accessToken: token.accessToken,
      refreshAfterEpochMs:
        this.#now() + token.expiresIn * 1000 - TOKEN_REFRESH_SAFETY_WINDOW_MS,
    };
    return token.accessToken;
  }
}

export function createOAuthTokenManager(
  config: RuntimeConfig,
  options: OAuthTokenManagerOptions = {},
): OAuthTokenManager {
  return new OAuthTokenManager(config, options);
}

function decodeProvisionedScopes(accessToken: string): readonly string[] {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== JWT_SEGMENT_COUNT || parts[1] === undefined) {
      throw new Error("invalid JWT shape");
    }

    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    const parsed = toastAccessTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("missing scope claim");
    }

    const rawScopes = Array.isArray(parsed.data.scope)
      ? parsed.data.scope
      : parsed.data.scope.split(/\s+/u).filter((scope) => scope.length > 0);
    const scopes: string[] = [];
    const seen = new Set<string>();

    for (const scope of rawScopes) {
      if (
        scope !== scope.trim() ||
        scope.length === 0 ||
        scope.length > MAX_SCOPE_LENGTH ||
        !SCOPE_PATTERN.test(scope)
      ) {
        throw new Error("invalid scope claim");
      }
      if (!seen.has(scope)) {
        seen.add(scope);
        scopes.push(scope);
      }
    }

    return Object.freeze(scopes);
  } catch {
    throw new ToastAuthError(
      "token_response_invalid",
      "Toast authentication access token did not contain a usable provisioned-scope claim.",
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ToastAuthError(
      "token_response_invalid",
      "Toast authentication returned a token response that was not valid JSON.",
      buildAuthErrorMetadata(response),
    );
  }
}

function buildAuthErrorMetadata(
  response: Response,
): { readonly upstreamStatus: number; readonly upstreamRequestId?: string } {
  const upstreamRequestId = response.headers.get("toast-request-id");
  return {
    upstreamStatus: response.status,
    ...(upstreamRequestId !== null ? { upstreamRequestId } : {}),
  };
}
