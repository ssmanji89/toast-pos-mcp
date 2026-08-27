import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalyticsReportJobError,
  createAnalyticsReportJobAdapter,
  type AnalyticsReportJobCreateInput,
} from "../src/analytics-report-jobs.js";
import {
  AnalyticsAccessError,
  createAnalyticsAccessAdapter,
  validateAnalyticsRestaurantSelection,
} from "../src/analytics-access.js";

const FIRST_GUID = "11111111-1111-4111-8111-111111111111";
const SECOND_GUID = "22222222-2222-4222-8222-222222222222";
const TOKEN_MARKER = "invented-report-job-token-marker-5504";
const RESULT_MARKER = "invented-unread-completed-result-marker-5504";

function restaurantResponse(): Response {
  return new Response(JSON.stringify({
    restaurants: [
      {
        restaurantGuid: FIRST_GUID,
        restaurantName: "Invented Analytics Restaurant One",
        active: true,
        testMode: false,
        archived: false,
      },
      {
        restaurantGuid: SECOND_GUID,
        restaurantName: "Invented Analytics Restaurant Two",
        active: false,
        testMode: true,
        archived: false,
      },
    ],
  }), { status: 200 });
}

function createTokenManager() {
  return {
    async getAuthorizationHeader() {
      return `Bearer ${TOKEN_MARKER}`;
    },
    async getProvisionedScopes() {
      return ["enterprise-metrics:read"];
    },
  };
}

async function createSelection(identity: object = {}) {
  const access = createAnalyticsAccessAdapter({
    identity,
    tokenManager: createTokenManager(),
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: async () => restaurantResponse(),
  });
  const registry = await access.refreshManagementGroupRestaurants();
  return {
    access,
    selection: validateAnalyticsRestaurantSelection(registry, [SECOND_GUID, FIRST_GUID]),
  };
}

function createInput(
  operation: AnalyticsReportJobCreateInput["operation"],
): AnalyticsReportJobCreateInput {
  switch (operation) {
    case "metrics":
      return {
        operation,
        timeRange: "day",
        startBusinessDate: "20260826",
      };
    case "check":
      return {
        operation,
        timeRange: "day",
        startBusinessDate: "20260826",
        endBusinessDate: "20260826",
      };
    case "labor":
      return {
        operation,
        timeRange: "week",
        startBusinessDate: "20260820",
        endBusinessDate: "20260826",
      };
    case "menu":
      return {
        operation,
        timeRange: "month",
        startBusinessDate: "20260801",
        endBusinessDate: "20260826",
      };
    case "payout_settled_date":
    case "payout_sales_date":
      return {
        operation,
        timeRange: "day",
        startDate: "20260826",
        endDate: "20260826",
      };
  }
}

test("Analytics report jobs use exactly the six reviewed create and retrieval routes", async () => {
  const expected = [
    ["metrics", "/era/v1/metrics/day", "/era/v1/metrics/opaque-metrics"],
    ["check", "/era/v1/check/day", "/era/v1/check/opaque-check"],
    ["labor", "/era/v1/labor/week", "/era/v1/labor/opaque-labor"],
    ["menu", "/era/v1/menu/month", "/era/v1/menu/opaque-menu"],
    ["payout_settled_date", "/era/v1/payout/day", "/era/v1/payout/opaque-payout_settled_date"],
    ["payout_sales_date", "/era/v1/payout/sales-date/day", "/era/v1/payout/sales-date/opaque-payout_sales_date"],
  ] as const;
  const { access, selection } = await createSelection();
  const requests: Array<{ readonly url: string; readonly init: RequestInit }> = [];
  let createIndex = 0;
  const adapter = createAnalyticsReportJobAdapter({
    access,
    tokenManager: createTokenManager(),
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      if (init?.method === "POST") {
        const next = expected[createIndex++];
        return new Response(JSON.stringify(`opaque-${next?.[0]}`), { status: 200 });
      }
      return unreadableCompleteResponse();
    },
  });

  for (const [operation, createPath, retrievePath] of expected) {
    const job = await adapter.create(selection, createInput(operation));
    const status = await adapter.retrieve(job);
    assert.deepEqual(status, { status: "complete", resultContract: "unavailable" });
    const createRequest = requests.at(-2);
    const retrieveRequest = requests.at(-1);
    assert.equal(createRequest?.url, `https://analytics.synthetic-toast-fixture.test${createPath}`);
    assert.equal(createRequest?.init.method, "POST");
    assert.equal(retrieveRequest?.url, `https://analytics.synthetic-toast-fixture.test${retrievePath}`);
    assert.equal(retrieveRequest?.init.method, "GET");
    assert.equal(new Headers(createRequest?.init.headers).get("authorization"), `Bearer ${TOKEN_MARKER}`);
    assert.equal(new Headers(createRequest?.init.headers).get("Toast-Restaurant-External-ID"), null);
    assert.deepEqual(JSON.parse(String(createRequest?.init.body)), {
      restaurantIds: [FIRST_GUID, SECOND_GUID],
      excludedRestaurantIds: [],
      ...expectedCreateBody(createInput(operation)),
    });
  }
  assert.equal(requests.length, 12);
});

test("Analytics report jobs reject forged authority and unreviewed outbound forms before fetch", async () => {
  const { access, selection } = await createSelection();
  let fetchCalls = 0;
  const adapter = createAnalyticsReportJobAdapter({
    access,
    tokenManager: createTokenManager(),
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify("opaque-id"), { status: 200 });
    },
  });
  const foreign = await createSelection({});
  const forged = Object.freeze({ restaurantGuids: selection.restaurantGuids });
  const invalidInputs: readonly unknown[] = [
    { ...createInput("metrics"), route: "/era/v1/guest/payments/day" },
    { ...createInput("metrics"), method: "PATCH" },
    { ...createInput("metrics"), timeRange: "hour" },
    { ...createInput("metrics"), restaurantIds: [SECOND_GUID] },
    { ...createInput("metrics"), excludedRestaurantIds: [SECOND_GUID] },
    { ...createInput("metrics"), onlyInactiveRestaurants: true },
    { ...createInput("metrics"), aggregateBy: "HOUR" },
    { ...createInput("labor"), groupBy: ["EMPLOYEE"] },
  ];

  for (const invalid of invalidInputs) {
    await assert.rejects(
      adapter.create(selection, invalid as AnalyticsReportJobCreateInput),
      isContractError,
    );
  }
  await assert.rejects(adapter.create(foreign.selection, createInput("metrics")), isSafeAuthorityError);
  await assert.rejects(adapter.create(forged, createInput("metrics")), isSafeAuthorityError);
  assert.equal(fetchCalls, 0);
});

test("Analytics report jobs retain only an opaque bounded create identifier and body-free statuses", async () => {
  const { access, selection } = await createSelection();
  const responses: Response[] = [
    new Response(JSON.stringify("opaque-report-request-id-5504"), { status: 200 }),
    unreadableCompleteResponse(),
    unreadableResponse(202),
    unreadableResponse(404),
    unreadableResponse(409),
    unreadableResponse(500),
  ];
  const adapter = createAnalyticsReportJobAdapter({
    access,
    tokenManager: createTokenManager(),
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: async () => responses.shift()!,
  });
  const job = await adapter.create(selection, createInput("metrics"));
  assert.equal(job.reportRequestId, "opaque-report-request-id-5504");
  assert.ok(Object.isFrozen(job));
  assert.equal(JSON.stringify(job).includes(TOKEN_MARKER), false);
  assert.equal(JSON.stringify(job).includes("analytics.synthetic-toast-fixture.test"), false);

  assert.deepEqual(await adapter.retrieve(job), { status: "complete", resultContract: "unavailable" });
  assert.deepEqual(await adapter.retrieve(job), { status: "pending" });
  assert.deepEqual(await adapter.retrieve(job), { status: "invalid_or_expired" });
  assert.deepEqual(await adapter.retrieve(job), { status: "replacement_required" });
  assert.deepEqual(await adapter.retrieve(job), { status: "failed_or_incomplete" });
});

test("Analytics report jobs reject malformed create identifiers without publishing a descriptor", async () => {
  const { access, selection } = await createSelection();
  const adapter = createAnalyticsReportJobAdapter({
    access,
    tokenManager: createTokenManager(),
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: async () => new Response(JSON.stringify(""), { status: 200 }),
  });
  await assert.rejects(adapter.create(selection, createInput("metrics")), isContractError);

  const tooLong = createAnalyticsReportJobAdapter({
    access,
    tokenManager: createTokenManager(),
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: async () => new Response(JSON.stringify("a".repeat(513)), { status: 200 }),
  });
  await assert.rejects(tooLong.create(selection, createInput("metrics")), isContractError);
});

function unreadableCompleteResponse(): Response {
  return unreadableResponse(200);
}

function unreadableResponse(status: number): Response {
  return {
    status,
    async json() {
      throw new Error(`The completed body must stay unread: ${RESULT_MARKER}`);
    },
  } as unknown as Response;
}

function isContractError(error: unknown): boolean {
  return error instanceof AnalyticsReportJobError
    && !error.message.includes(TOKEN_MARKER)
    && !error.message.includes(RESULT_MARKER);
}

function isSafeAuthorityError(error: unknown): boolean {
  return (error instanceof AnalyticsAccessError || error instanceof AnalyticsReportJobError)
    && !error.message.includes(TOKEN_MARKER)
    && !error.message.includes(RESULT_MARKER);
}

function expectedCreateBody(
  input: AnalyticsReportJobCreateInput,
): Record<string, string> {
  const { operation: _operation, timeRange: _timeRange, ...body } = input;
  return body;
}
