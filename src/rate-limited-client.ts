import { AsyncLocalStorage } from "node:async_hooks";

import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import {
  readToastRateLimitLimit,
  readToastRateLimitObservation,
  readToastRateLimitRemaining,
  readToastRateLimitResetAtEpochMs,
  ToastRateLimitCoordinator,
  toastApiKeyFromPath,
} from "./rate-limit.js";
import {
  ToastHttpClient,
  ToastHttpError,
  ToastRateLimitPreflightError,
  type ToastConfigurationPagesRequest,
  type ToastDetailedJsonResult,
  type ToastGetJsonRequest,
  type ToastHttpClientOptions,
  type ToastOrdersBulkFoldOptions,
  type ToastOrdersBulkPageConsumer,
  type ToastOrdersBulkPagesRequest,
} from "./transport.js";

const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CANCELLED_TURN = Symbol("cancelled-standard-fetch-turn");

interface RequestCancellationContext {
  readonly signal: AbortSignal | undefined;
}

class ToastRequestCancellationPreflightError extends ToastRateLimitPreflightError {
  constructor() {
    super();
    this.name = "ToastRequestCancellationPreflightError";
  }
}

export interface RateLimitAwareToastHttpClientOptions extends ToastHttpClientOptions {
  readonly rateLimitCoordinator?: ToastRateLimitCoordinator;
}

/**
 * Internal/report-facing options deliberately accept a present `undefined`
 * signal because they are often forwarded from another optional-options
 * object under exactOptionalPropertyTypes. Before crossing into the accepted
 * base transport, this wrapper normalizes undefined back to an absent field.
 */
export interface CancellableRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

type SerializedFetchDecision =
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "response"; readonly response: Response };

export class RateLimitAwareToastHttpClient extends ToastHttpClient {
  #cancellationContext: AsyncLocalStorage<RequestCancellationContext>;

  constructor(
    config: RuntimeConfig,
    tokenManager: OAuthTokenManager,
    options: RateLimitAwareToastHttpClientOptions = {},
  ) {
    const { rateLimitCoordinator, ...transportOptions } = options;
    const coordinator = rateLimitCoordinator ?? new ToastRateLimitCoordinator();
    const underlyingFetch = transportOptions.fetch ?? fetch;
    const rawSleep = transportOptions.sleep;
    const now = transportOptions.now ?? Date.now;
    const maxWaitMs = transportOptions.maxRateLimitWaitMs ?? 15 * 60 * 1000;
    const cancellationContext = new AsyncLocalStorage<RequestCancellationContext>();
    let fetchTail: Promise<void> = Promise.resolve();

    const cancellableBaseSleep = async (milliseconds: number): Promise<void> => {
      const signal = cancellationContext.getStore()?.signal;
      const completed = await sleepUntilOrCancelled(rawSleep, milliseconds, signal);
      if (!completed) {
        throw requestCancelledError();
      }
    };

    const coordinatedFetch: typeof fetch = async (input, init) => {
      const signal = cancellationContext.getStore()?.signal;
      throwCancellationPreflightIfAborted(signal);

      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      const headers = new Headers(init?.headers);
      const restaurantGuid =
        headers.get("toast-restaurant-external-id")?.toLowerCase() ?? undefined;
      const context = Object.freeze({
        restaurantGuid,
        apiKey: toastApiKeyFromPath(url.pathname as `/${string}`),
        endpointKey: endpointKeyFromPath(url.pathname),
      });

      for (;;) {
        throwCancellationPreflightIfAborted(signal);
        const decision = await withSerializedTurn(
          fetchTail,
          (nextTail) => { fetchTail = nextTail; },
          signal,
          async (): Promise<SerializedFetchDecision> => {
            throwCancellationPreflightIfAborted(signal);
            const waitMs = coordinator.waitMilliseconds(context, now());
            if (waitMs > maxWaitMs) {
              throw new ToastRateLimitPreflightError();
            }
            if (waitMs > 0) {
              return { kind: "wait", milliseconds: waitMs };
            }

            let response: Response;
            try {
              response = await underlyingFetch(input, {
                ...init,
                ...(signal === undefined ? {} : { signal }),
              });
            } catch (error) {
              if (signal?.aborted) {
                throw new ToastRequestCancellationPreflightError();
              }
              throw error;
            }

            coordinator.record(context, readToastRateLimitObservation(response, now()));
            throwCancellationPreflightIfAborted(signal);
            return {
              kind: "response",
              response: withCurrentRateLimitAliases(response),
            };
          },
        );

        if (decision === CANCELLED_TURN) {
          throw new ToastRequestCancellationPreflightError();
        }
        if (decision.kind === "response") {
          return decision.response;
        }

        const slept = await sleepUntilOrCancelled(rawSleep, decision.milliseconds, signal);
        if (!slept) {
          throw new ToastRequestCancellationPreflightError();
        }
      }
    };

    super(config, tokenManager, {
      ...transportOptions,
      fetch: coordinatedFetch,
      sleep: cancellableBaseSleep,
    });
    this.#cancellationContext = cancellationContext;
  }

  async getJsonDetailedCancellable(
    request: ToastGetJsonRequest,
    options: CancellableRequestOptions = {},
  ): Promise<ToastDetailedJsonResult> {
    return this.#runCancellable(options.signal, () => super.getJsonDetailed(request));
  }

  async getAccessibleRestaurantsJsonDetailedCancellable(
    options: CancellableRequestOptions = {},
  ): Promise<ToastDetailedJsonResult> {
    return this.#runCancellable(
      options.signal,
      () => super.getAccessibleRestaurantsJsonDetailed(),
    );
  }

  async getConfigurationPagesDetailedCancellable(
    request: ToastConfigurationPagesRequest,
    options: CancellableRequestOptions = {},
  ): Promise<readonly ToastDetailedJsonResult[]> {
    return this.#runCancellable(
      options.signal,
      () => super.getConfigurationPagesDetailed(request),
    );
  }

  async foldOrdersBulkPagesCancellable<TState>(
    request: ToastOrdersBulkPagesRequest,
    initialState: TState,
    consumePage: ToastOrdersBulkPageConsumer<TState>,
    options: CancellableRequestOptions = {},
  ): Promise<TState> {
    const baseOptions: ToastOrdersBulkFoldOptions =
      options.signal === undefined ? {} : { signal: options.signal };

    return this.#runCancellable(
      options.signal,
      () => super.foldOrdersBulkPages(
        request,
        initialState,
        consumePage,
        baseOptions,
      ),
    );
  }

  async #runCancellable<T>(
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (signal?.aborted) throw requestCancelledError();
    try {
      const result = await this.#cancellationContext.run({ signal }, operation);
      if (signal?.aborted) throw requestCancelledError();
      return result;
    } catch (error) {
      if (signal?.aborted) throw requestCancelledError();
      throw error;
    }
  }
}

export function createRateLimitAwareToastHttpClient(
  config: RuntimeConfig,
  tokenManager: OAuthTokenManager,
  options: RateLimitAwareToastHttpClientOptions = {},
): RateLimitAwareToastHttpClient {
  return new RateLimitAwareToastHttpClient(config, tokenManager, options);
}

async function withSerializedTurn<T>(
  tail: Promise<void>,
  publishTail: (tail: Promise<void>) => void,
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
): Promise<T | typeof CANCELLED_TURN> {
  let release!: () => void;
  const currentTurn = new Promise<void>((resolve) => { release = resolve; });
  const previousTurn = tail;
  publishTail(previousTurn.then(() => currentTurn));
  const acquired = await waitForTurn(previousTurn, signal);
  if (!acquired) {
    release();
    return CANCELLED_TURN;
  }
  try {
    return await task();
  } finally {
    release();
  }
}

async function waitForTurn(
  previousTurn: Promise<void>,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal === undefined) {
    await previousTurn;
    return true;
  }
  if (signal.aborted) return false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = (): void => finish(false);
    signal.addEventListener("abort", onAbort, { once: true });
    previousTurn.then(() => finish(true), () => finish(true));
  });
}

async function sleepUntilOrCancelled(
  injectedSleep: ((milliseconds: number) => Promise<void>) | undefined,
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (injectedSleep === undefined) {
    return defaultSleepUntilOrCancelled(milliseconds, signal);
  }
  if (signal === undefined) {
    await injectedSleep(milliseconds);
    return true;
  }
  if (signal.aborted) return false;
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = (): void => finish(false);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(injectedSleep(milliseconds)).then(
      () => finish(true),
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function defaultSleepUntilOrCancelled(
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = (): void => finish(false);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => finish(true), milliseconds);
  });
}

function throwCancellationPreflightIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ToastRequestCancellationPreflightError();
}

function requestCancelledError(): ToastHttpError {
  return new ToastHttpError(
    "request_cancelled",
    "Toast data request was cancelled before completion.",
    { apiFamily: "standard", retryable: false },
  );
}

function withCurrentRateLimitAliases(response: Response): Response {
  const headers = new Headers(response.headers);
  mirrorCurrentNumericHeader(response, headers, "x-toast-ratelimit-remaining", "toast-ratelimit-remaining", readToastRateLimitRemaining(response));
  mirrorCurrentNumericHeader(response, headers, "x-toast-ratelimit-reset", "toast-ratelimit-reset", readToastRateLimitResetAtEpochMs(response));
  mirrorCurrentNumericHeader(response, headers, "x-toast-ratelimit-limit", "toast-ratelimit-limit", readToastRateLimitLimit(response));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function mirrorCurrentNumericHeader(
  response: Response,
  headers: Headers,
  currentName: string,
  legacyName: string,
  parsedValue: number | undefined,
): void {
  if (response.headers.get(currentName) === null) return;
  if (parsedValue === undefined) {
    headers.delete(legacyName);
    return;
  }
  headers.set(legacyName, String(parsedValue));
}

function endpointKeyFromPath(pathname: string): string {
  return pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => UUID_PATH_SEGMENT.test(segment) ? ":id" : segment.toLowerCase())
    .join("/");
}
