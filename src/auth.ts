import { z } from "zod";

import {
  getRuntimeConfigCredentials,
  type RuntimeConfig,
} from "./config.js";

const AUTHENTICATION_LOGIN_PATH = "/authentication/v1/authentication/login";
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000;

/**
 * Sanity ceiling on Toast's returned `expiresIn` (seconds).
 *
 * T0 research (`docs/research/toast-api-reporting-landscape.md`) documents the
 * authentication request body precisely but says nothing about a maximum
 * token lifetime; the client is told only to cache "according to the
 * returned expiry rather than assuming a fixed duration." Without an upper
 * bound, `z.number().int().positive()` accepts `Number.MAX_SAFE_INTEGER`,
 * which computes a refresh time millions of years in the future and silently
 * defeats the final-minute refresh contract for the life of the process.
 *
 * 24 hours is chosen as a defensible, generous ceiling: no legitimate
 * client-credentials access token needs to be cached longer than a day, so
 * this comfortably accommodates any plausible Toast-issued expiry while
 * still rejecting the class of implausible values (integer overflow,
 * corrupted upstream response, hostile stand-in) that would otherwise cache
 * a token as effectively permanent. See T1-003-R1-F1.
 */
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

  async #requestAccessToken(): Promise<string> {
    const credentials = getRuntimeConfigCredentials(this.#config);
    let response: Response;

    try {
      response = await this.#fetch(
        `https://${this.#config.apiHostname}${AUTHENTICATION_LOGIN_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            userAccessType: this.#config.machineClientAccessType,
          }),
        },
      );
    } catch {
      // `this.#fetch` is an injectable `OAuthFetch`; a later slice (T1-004)
      // or a hostile stand-in could reject with an error whose `message`
      // carries upstream body content, header values, or other unsanitized
      // detail. Every other failure path in this file normalizes through
      // `ToastAuthError` and never surfaces an upstream body; this path must
      // have the same guarantee. Deliberately do not read or interpolate
      // any property of the caught value here.
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
