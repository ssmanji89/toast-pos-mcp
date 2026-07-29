import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import { createOAuthTokenManager, ToastAuthError } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import {
  SYNTHETIC_CLIENT_SECRET_MARKER,
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "./support/synthetic-runtime-env.js";

const SYNTHETIC_ACCESS_TOKEN_MARKER =
  "synthetic-access-token-marker-do-not-leak";

test("requests a Toast OAuth token with the documented client-credentials body and returned expiry", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const clock = new MutableClock(Date.UTC(2026, 6, 29, 12, 0, 0));
  const fetch = new RecordingFetch([
    tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-1`, 600),
    tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-2`, 600),
  ]);
  const manager = createOAuthTokenManager(config, {
    fetch: fetch.fetch,
    now: () => clock.now(),
  });

  const token = await manager.getAccessToken();

  assert.equal(token, `${SYNTHETIC_ACCESS_TOKEN_MARKER}-1`);
  assert.equal(fetch.calls.length, 1);
  assert.equal(
    fetch.calls[0]?.url,
    "https://ws-api.synthetic-toast-fixture.test/authentication/v1/authentication/login",
  );
  assert.equal(fetch.calls[0]?.init.method, "POST");
  assert.equal(fetch.calls[0]?.headers["content-type"], "application/json");
  assert.deepEqual(fetch.calls[0]?.body, {
    clientId: "synthetic-client-id-0001",
    clientSecret: SYNTHETIC_CLIENT_SECRET_MARKER,
    userAccessType: "TOAST_MACHINE_CLIENT",
  });

  clock.advanceSeconds(539);
  assert.equal(await manager.getAccessToken(), `${SYNTHETIC_ACCESS_TOKEN_MARKER}-1`);
  assert.equal(fetch.calls.length, 1);

  clock.advanceSeconds(1);
  assert.equal(await manager.getAccessToken(), `${SYNTHETIC_ACCESS_TOKEN_MARKER}-2`);
  assert.equal(fetch.calls.length, 2);
});

test("deduplicates simultaneous token requests behind one authentication exchange", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const fetch = new DeferredFetch();
  const manager = createOAuthTokenManager(config, { fetch: fetch.fetch });

  const first = manager.getAccessToken();
  const second = manager.getAccessToken();
  fetch.resolveNext(tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-deduped`, 300));

  assert.equal(await first, `${SYNTHETIC_ACCESS_TOKEN_MARKER}-deduped`);
  assert.equal(await second, `${SYNTHETIC_ACCESS_TOKEN_MARKER}-deduped`);
  assert.equal(fetch.calls.length, 1);
});

test("propagates a rejected in-flight token request to every concurrent caller, then issues a fresh request that succeeds", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const fetch = new DeferredFetch();
  const manager = createOAuthTokenManager(config, { fetch: fetch.fetch });

  const first = manager.getAccessToken();
  const second = manager.getAccessToken();
  const third = manager.getAccessToken();
  fetch.rejectNext(
    new Error(`network failure while sending ${SYNTHETIC_CLIENT_SECRET_MARKER}`),
  );

  await assert.rejects(first, ToastAuthError);
  await assert.rejects(second, ToastAuthError);
  await assert.rejects(third, ToastAuthError);
  assert.equal(fetch.calls.length, 1);

  const fourth = manager.getAccessToken();
  fetch.resolveNext(
    tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-after-rejection`, 300),
  );

  assert.equal(await fourth, `${SYNTHETIC_ACCESS_TOKEN_MARKER}-after-rejection`);
  assert.equal(fetch.calls.length, 2);
});

test("returns an authorization header from the cached bearer token", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const fetch = new RecordingFetch([
    tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-header`, 600),
  ]);
  const manager = createOAuthTokenManager(config, { fetch: fetch.fetch });

  assert.equal(
    await manager.getAuthorizationHeader(),
    `Bearer ${SYNTHETIC_ACCESS_TOKEN_MARKER}-header`,
  );
  assert.equal(fetch.calls.length, 1);
});

test("wraps a rejected token fetch in a sanitized ToastAuthError without leaking the caught error's detail", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const networkFailureFetch = async (): Promise<Response> => {
    throw new Error(
      `network failure while sending ${SYNTHETIC_CLIENT_SECRET_MARKER}`,
    );
  };
  const manager = createOAuthTokenManager(config, {
    fetch: networkFailureFetch,
  });

  await assert.rejects(
    manager.getAccessToken(),
    (error: unknown) => {
      assert.ok(error instanceof ToastAuthError);
      assert.equal(error.code, "token_request_network_error");
      const rendered = [
        error.message,
        error.code,
        JSON.stringify(error),
        inspect(error, { depth: null, showHidden: true, customInspect: false }),
        inspect(error, { depth: null }),
      ].join(" ");
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      return true;
    },
  );
});

test("fails closed on an unsuccessful token response without echoing credentials or bearer tokens", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const fetch = new RecordingFetch([
    jsonResponse(
      {
        status: "FAILURE",
        message: `upstream text containing ${SYNTHETIC_CLIENT_SECRET_MARKER} and ${SYNTHETIC_ACCESS_TOKEN_MARKER}`,
      },
      {
        status: 401,
        headers: { "Toast-Request-Id": "synthetic-request-id-401" },
      },
    ),
  ]);
  const manager = createOAuthTokenManager(config, { fetch: fetch.fetch });

  await assert.rejects(
    manager.getAccessToken(),
    (error: unknown) => {
      assert.ok(error instanceof ToastAuthError);
      assert.equal(error.code, "token_request_failed");
      assert.equal(error.upstreamStatus, 401);
      assert.equal(error.upstreamRequestId, "synthetic-request-id-401");
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
      return true;
    },
  );
});

test("fails closed on malformed token payloads without caching an unusable token", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const fetch = new RecordingFetch([
    jsonResponse({ token: { tokenType: "Bearer", expiresIn: 300 } }),
    tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-after-malformed`, 300),
  ]);
  const manager = createOAuthTokenManager(config, { fetch: fetch.fetch });

  await assert.rejects(manager.getAccessToken(), ToastAuthError);

  assert.equal(await manager.getAccessToken(), `${SYNTHETIC_ACCESS_TOKEN_MARKER}-after-malformed`);
  assert.equal(fetch.calls.length, 2);
});

test("does not expose cached bearer tokens through manager enumeration or inspection", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const fetch = new RecordingFetch([
    tokenResponse(`${SYNTHETIC_ACCESS_TOKEN_MARKER}-stored`, 300),
  ]);
  const manager = createOAuthTokenManager(config, { fetch: fetch.fetch });

  await manager.getAccessToken();

  const observed = [
    Object.keys(manager),
    Object.getOwnPropertyNames(manager),
    Object.entries(manager),
    Object.values(manager),
    { ...manager },
    Object.assign({}, manager),
    structuredClone(manager),
    inspect(manager, { depth: null, showHidden: true, customInspect: false }),
    JSON.stringify(manager),
  ]
    .map((value) => inspect(value, { depth: null }))
    .join(" ");

  const forInCollected: Record<string, unknown> = {};
  for (const key in manager) {
    forInCollected[key] = (manager as unknown as Record<string, unknown>)[key];
  }

  assert.ok(!observed.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
  assert.ok(!observed.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
  assert.ok(!inspect(forInCollected).includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
  assert.ok(!inspect(forInCollected).includes(SYNTHETIC_CLIENT_SECRET_MARKER));
});

class MutableClock {
  #milliseconds: number;

  constructor(milliseconds: number) {
    this.#milliseconds = milliseconds;
  }

  now(): number {
    return this.#milliseconds;
  }

  advanceSeconds(seconds: number): void {
    this.#milliseconds += seconds * 1000;
  }
}

interface RecordedCall {
  readonly url: string;
  readonly init: {
    readonly method: string | undefined;
    readonly body: unknown;
    readonly headers: unknown;
  };
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

class RecordingFetch {
  readonly calls: RecordedCall[] = [];
  #responses: Response[];

  constructor(responses: Response[]) {
    this.#responses = responses;
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    this.calls.push(recordCall(input, init));
    const next = this.#responses.shift();
    if (next === undefined) {
      throw new Error("RecordingFetch received more calls than responses");
    }
    return next;
  };
}

class DeferredFetch {
  readonly calls: RecordedCall[] = [];
  #pending:
    | {
        readonly resolve: (response: Response) => void;
        readonly reject: (reason: unknown) => void;
      }
    | undefined;

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      this.calls.push(recordCall(input, init));
      this.#pending = { resolve, reject };
    });

  resolveNext(response: Response): void {
    if (this.#pending === undefined) {
      throw new Error("DeferredFetch has no pending request");
    }
    this.#pending.resolve(response);
    this.#pending = undefined;
  }

  rejectNext(reason: unknown): void {
    if (this.#pending === undefined) {
      throw new Error("DeferredFetch has no pending request");
    }
    this.#pending.reject(reason);
    this.#pending = undefined;
  }
}

function recordCall(input: string | URL | Request, init?: RequestInit): RecordedCall {
  const headers = new Headers(init?.headers);
  const headerRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerRecord[key] = value;
  });

  return {
    url: String(input),
    init: {
      method: init?.method,
      body: init?.body,
      headers: init?.headers,
    },
    headers: headerRecord,
    body: JSON.parse(String(init?.body)),
  };
}

function tokenResponse(accessToken: string, expiresIn: number): Response {
  return jsonResponse({
    status: "SUCCESS",
    token: {
      tokenType: "Bearer",
      scope: null,
      expiresIn,
      accessToken,
    },
  });
}

function jsonResponse(
  body: unknown,
  options: { readonly status?: number; readonly headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
}
