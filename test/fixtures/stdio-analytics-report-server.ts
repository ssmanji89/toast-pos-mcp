import { createApplicationRuntime } from "../../src/runtime.js";
import { createServer } from "../../src/server.js";
import { startStdioServer } from "../../src/stdio.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "../support/synthetic-runtime-env.js";
import { syntheticJwt } from "./stdio-report-data.js";

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000005003";
const OTHER_RESTAURANT_GUID = "00000000-0000-4000-8000-000000005004";
const scenario = (process.argv[2] ?? "success") as Scenario;
let now = 1_786_665_600_000;
let replacementTurns = 0;

type Scenario =
  | "success"
  | "absent-analytics-runtime"
  | "missing-analytics-scope"
  | "inaccessible-analytics-restaurant"
  | "pending-exhausted"
  | "invalid-or-expired"
  | "replacement-exhausted"
  | "request-failed"
  | "result-contract-unavailable"
  | "cancel-active-analytics";

const env = scenario === "absent-analytics-runtime"
  ? SYNTHETIC_VALID_RUNTIME_ENV
  : Object.freeze({
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_ANALYTICS_API_HOSTNAME: "analytics.synthetic-toast-fixture.test",
      TOAST_ANALYTICS_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
      TOAST_ANALYTICS_CLIENT_ID: "synthetic-analytics-client-id-5003",
      TOAST_ANALYTICS_CLIENT_SECRET: "synthetic-analytics-client-secret-5003",
    });

const runtime = createApplicationRuntime({
  env,
  now: () => scenario === "pending-exhausted" ? (now += 31_000) : now,
  maxAttempts: 1,
  random: () => 0,
  sleep: async () => undefined,
  authFetch: async (input) => {
    const url = input;
    const analytics = url.includes("analytics.synthetic-toast-fixture.test");
    return jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: syntheticJwt(
          analytics && scenario === "missing-analytics-scope"
            ? ["orders:read"]
            : analytics
              ? ["enterprise-metrics:read"]
              : ["orders:read"],
        ),
      },
    });
  },
  dataFetch: analyticsFetch,
});

startStdioServer(({ era, acceptedRequests }) => createServer(
  era === "modern"
    ? { runtime, acceptedRequests }
    : { advertiseToolListChanged: true, acceptedRequests },
));

async function analyticsFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  const headers = new Headers(init?.headers);
  const method = init?.method ?? "GET";
  const headerNames = [...headers.keys()].sort();
  const queryKeys = [...url.searchParams.keys()].sort();
  const postKeys = init?.body === undefined
    ? []
    : Object.keys(JSON.parse(String(init.body)) as Record<string, unknown>).sort();
  console.error(`analytics-fixture-request:${method}:${url.pathname}:headers=${headerNames.join(",")}:query=${queryKeys.join(",")}:post=${postKeys.join(",")}`);

  if (headers.has("toast-restaurant-external-id")) {
    throw new Error("Analytics fixture rejects Standard restaurant headers");
  }
  if (url.pathname === "/era/v1/restaurants-information" && method === "GET") {
    if (queryKeys.length !== 0 || postKeys.length !== 0) throw new Error("Analytics discovery must not construct a query or body");
    return jsonResponse({
      restaurants: [{
        restaurantGuid: scenario === "inaccessible-analytics-restaurant" ? OTHER_RESTAURANT_GUID : RESTAURANT_GUID,
        restaurantName: "Synthetic Analytics Restaurant",
        active: true,
        testMode: false,
        archived: false,
      }],
    }, "analytics-discovery-safe-request");
  }
  if (url.pathname === "/era/v1/metrics/day" && method === "POST") {
    if (scenario === "request-failed") return new Response("", { status: 503 });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assertMetricsDayBody(body);
    return jsonResponse("synthetic-opaque-report-id-5003", "analytics-create-safe-request", 202);
  }
  if (url.pathname === "/era/v1/metrics/synthetic-opaque-report-id-5003" && method === "GET") {
    if (scenario === "pending-exhausted") return new Response("opaque-pending-marker", { status: 202 });
    if (scenario === "invalid-or-expired") return new Response("opaque-expired-marker", { status: 404 });
    if (scenario === "replacement-exhausted") {
      replacementTurns += 1;
      return new Response("opaque-replacement-marker", { status: 409 });
    }
    if (scenario === "cancel-active-analytics") {
      console.error("analytics-fetch-started");
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => {
        console.error("analytics-fetch-aborted");
        reject(new Error("synthetic Analytics cancellation"));
      }, { once: true }));
    }
    return new Response("opaque-result-body-marker-never-public", {
      status: 200,
      headers: { "toast-request-id": "analytics-retrieve-safe-request" },
    });
  }
  throw new Error(`Analytics fixture rejected route ${method} ${url.pathname}`);
}

function assertMetricsDayBody(body: Record<string, unknown>): void {
  const allowed = ["endBusinessDate", "excludedRestaurantIds", "restaurantIds", "startBusinessDate"];
  if (Object.keys(body).sort().join(",") !== allowed.join(",")) throw new Error("Analytics fixture received a non-closed Metrics/day request body");
  if (JSON.stringify(body.restaurantIds) !== JSON.stringify([RESTAURANT_GUID])) throw new Error("Analytics fixture requires one selected restaurant");
  if (JSON.stringify(body.excludedRestaurantIds) !== "[]") throw new Error("Analytics fixture rejects inactive exclusions");
  if (body.startBusinessDate !== "20260816" || body.endBusinessDate !== "20260816") throw new Error("Analytics fixture requires equal business dates");
}

function jsonResponse(value: unknown, requestId?: string, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      ...(requestId === undefined ? {} : { "toast-request-id": requestId }),
    },
  });
}
