import { z } from "zod";

import {
  getRuntimeConfigCredentials,
  type RuntimeConfig,
} from "./config.js";

const AUTHENTICATION_LOGIN_PATH = "/authentication/v1/authentication/login";
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000;

const toastTokenResponseSchema = z.object({
  token: z.object({
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int().positive(),
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
    const response = await this.#fetch(
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
