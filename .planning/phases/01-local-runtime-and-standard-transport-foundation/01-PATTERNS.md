# Phase 1: Local runtime and Standard transport foundation - Pattern Map

**Mapped:** 2026-08-26  
**Files analyzed:** 6  
**Analogs found:** 6 / 6 files; the cancellable handler itself has no local implementation analog

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `test/server.test.ts` | test | child-process request-response | `test/server.test.ts` | exact existing target |
| `test/protocol-cancellation.test.ts` | test | child-process request-response and cancellation | `test/server.test.ts` | exact role and transport |
| `test/fixtures/protocol-cancellation-server.ts` | test fixture | event-driven stdio request-response | `src/server.ts` plus `src/stdio.ts` | role-match; conditional new fixture |
| `src/transport.ts` | service | request-response and state transform | `src/transport.ts` rate-limit helpers | exact existing target |
| `test/transport.test.ts` | test | request-response and deterministic state | `test/transport.test.ts` | exact existing target |
| `docs/research/toast-api-reporting-landscape.md` | documentation | source-to-contract transform | its location-source correction and rate-limit sections | exact document pattern |

The separate fixture file is conditional. Use it when the cancellation server must run as a child process outside the test runner process.

## Pattern Assignments

### `test/server.test.ts` (test, child-process request-response)

**Analog:** `test/server.test.ts`

Keep the official SDK imports and local `.js` import convention from lines 1-14:

```typescript
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { createServer, SERVER_IDENTITY } from "../src/server.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";
```

Reuse the real executable client factory from lines 118-149:

```typescript
interface TestConnection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

function createStdioClient(era: "legacy" | "modern"): TestConnection {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX_PATH],
    cwd: process.cwd(),
    stderr: "pipe",
    env: { ...SYNTHETIC_VALID_RUNTIME_ENV },
  });
  const client = new Client(
    { name: `toast-pos-mcp-${era}-test-client`, version: "0.0.0" },
    era === "modern"
      ? {
          versionNegotiation: {
            mode: { pin: MODERN_PROTOCOL_VERSION },
            probe: { timeoutMs: STDIO_CONNECT_TIMEOUT_MS },
          },
        }
      : { versionNegotiation: { mode: "legacy" } },
  );

  return { client, transport };
}
```

Extend the existing restart proof from lines 60-81. Capture `transport.pid`, close the first client, reconnect, and require a different non-null PID.

Add retained-process proof after each connection. The Phase 1 research requires two sequential and two concurrent operations on the same captured PID:

```typescript
const pid = connection.transport.pid;
assert.ok(pid !== null);

if (era === "legacy") {
  await connection.client.ping();
  await connection.client.ping();
  await Promise.all([connection.client.ping(), connection.client.ping()]);
} else {
  await connection.client.discover();
  await connection.client.discover();
  await Promise.all([
    connection.client.discover(),
    connection.client.discover(),
  ]);
}

assert.equal(connection.transport.pid, pid);
```

Do not use `listTools()` for the modern request proof. The client can satisfy an empty capability result locally.

Keep every connection inside `try/finally`, as lines 31-38 and 71-80 do. Close the client in `finally` so a failed assertion cannot leave a child process alive.

Use the bounded promise helper from lines 202-221 for connect and request operations:

```typescript
try {
  return await Promise.race([operation, timeout]);
} finally {
  if (timeoutHandle !== undefined) {
    clearTimeout(timeoutHandle);
  }
}
```

Preserve the missing-state process proof from lines 84-116. It requires a nonzero exit, empty stdout, a static stderr marker, and no synthetic secret marker.

---

### `test/protocol-cancellation.test.ts` (test, child-process request-response and cancellation)

**Analog:** `test/server.test.ts`

Copy these conventions:

- Use `node:test` and `node:assert/strict` from lines 1-4.
- Spawn compiled JavaScript with `process.execPath`, as lines 123-130 do.
- Use the official `Client` and `StdioClientTransport`, as lines 6-8 do.
- Pin the modern protocol with the factory from lines 131-146.
- Bound the test and every long operation with the timeout pattern from lines 202-221.
- Close the client in `finally`, as lines 31-38 do.

Use the research-proven official-client cancellation shape:

```typescript
const controller = new AbortController();
const pending = client.callTool(
  { name: "phase1_wait", arguments: {} },
  { signal: controller.signal },
);

controller.abort("phase1 cancellation proof");
await assert.rejects(pending);
await client.discover();
```

The test must also receive an explicit synthetic observation that the server handler's `ctx.mcpReq.signal` aborted. A rejected client promise alone is insufficient.

After cancellation, send a supported request on the same PID. This proves that cancellation does not terminate the retained stdio process.

Do not import or use an in-memory transport. Do not inject `fakeServe`; `test/stdio.test.ts` lines 22-34 show that seam, but it is only a wrapper-error unit test.

---

### `test/fixtures/protocol-cancellation-server.ts` (test fixture, event-driven stdio request-response)

**Analogs:** `src/server.ts` and `src/stdio.ts`

Use the isolated server factory shape from `src/server.ts` lines 14-24:

```typescript
export function createServer(_options: CreateServerOptions = {}): McpServer {
  return new McpServer(SERVER_IDENTITY);
}
```

Use the official serving boundary from `src/stdio.ts` lines 55-58:

```typescript
handle = serve(factory, {
  legacy: "serve",
  onerror: failClosed,
});
```

Register only one synthetic wait tool in the fixture. Use the handler signal pattern from Phase 1 research:

```typescript
server.registerTool("phase1_wait", {}, async (ctx) => {
  await new Promise<never>((_resolve, reject) => {
    ctx.mcpReq.signal.addEventListener(
      "abort",
      () => reject(ctx.mcpReq.signal.reason),
      { once: true },
    );
  });
});
```

The fixture must communicate only synthetic state. It must never read Toast credentials or Merchant Data.

Keep this registration outside `src/server.ts`. Phase 1 must not add a production MCP tool or change the empty production capability surface.

The repository has no existing cancellable tool handler. Use `01-RESEARCH.md` for the exact handler API, and use the local analogs only for factory and stdio structure.

---

### `src/transport.ts` (service, request-response and state transform)

**Analog:** Existing rate-limit pipeline in `src/transport.ts`

Preserve the existing request pipeline. `#requestJson` lines 614-737 obtains the token, performs GET, records rate-limit state, classifies status, and parses JSON.

Change only the official Toast field names in both snapshot builders. Keep the frozen immutable shape from lines 784-827:

```typescript
const snapshot: ToastRateLimitSnapshot = Object.freeze({
  apiFamily,
  restaurantGuid,
  key,
  limit: numericHeader(response, "x-toast-ratelimit-limit"),
  remaining: numericHeader(response, "x-toast-ratelimit-remaining"),
  resetAtEpochMs: epochHeader(response, "x-toast-ratelimit-reset"),
  retryAfterEpochMs,
  updatedAtEpochMs: now,
});
```

Apply the same names to `#recordCredentialRateLimit` at lines 807-827. Do not create a second parser or state store.

Repair the fallback lookup at lines 1202-1231:

```typescript
return numericHeader(response, "x-toast-ratelimit-remaining") === 0
  ? epochHeader(response, "x-toast-ratelimit-reset")
  : undefined;
```

Preserve strict numeric parsing from lines 1234-1242:

```typescript
const parsed = Number.parseInt(raw, 10);
return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
```

Preserve the bounded seconds-or-milliseconds conversion from lines 1254-1261:

```typescript
const parsed = numericHeader(response, name);
if (parsed === undefined) {
  return undefined;
}

return parsed > 9_999_999_999 ? parsed : parsed * 1000;
```

Update the comment at lines 1244-1252. It must say the current official contract is an absolute UNIX-epoch timestamp.

Keep the seconds-versus-milliseconds ambiguity explicit. Do not reclassify small values as a relative delta.

Preserve restaurant isolation from lines 1263-1293. The official field-name repair must not change the `standard:restaurant:<guid>:<key>` and credential namespaces.

Preserve the fail-closed wait ceiling at lines 838-881. The header repair must not clamp or bypass an excessive reset.

---

### `test/transport.test.ts` (test, request-response and deterministic state)

**Analog:** Existing `TransportHarness` and rate-limit tests in `test/transport.test.ts`

Keep the import and synthetic marker style from lines 1-27. Use invented GUIDs and token markers only.

Use the response-to-snapshot proof from lines 29-87. Replace all relevant fixture keys with official `X-Toast-*` names:

```typescript
headers: {
  "X-Toast-RateLimit-Limit": "20",
  "X-Toast-RateLimit-Remaining": "19",
  "X-Toast-RateLimit-Reset": "1785326405",
}
```

Assert the complete snapshot, including `apiFamily`, normalized scope, limiter key, converted epoch, and update time. Do not assert only one field.

Retain both encoding boundaries from lines 89-157:

- A value above `9_999_999_999` remains milliseconds.
- A smaller documented absolute value converts from seconds to milliseconds.

Add the prefix-negative test beside those tests. Supply only the obsolete approximations and require all three official snapshot fields to remain `undefined`:

```typescript
headers: {
  "Toast-RateLimit-Limit": "20",
  "Toast-RateLimit-Remaining": "0",
  "Toast-RateLimit-Reset": "101",
}

assert.deepEqual(
  harness.client.getRateLimitSnapshot("standard", guid, "ordersBulk"),
  {
    apiFamily: "standard",
    restaurantGuid: guid,
    key: "ordersBulk",
    limit: undefined,
    remaining: undefined,
    resetAtEpochMs: undefined,
    retryAfterEpochMs: undefined,
    updatedAtEpochMs: now,
  },
);
assert.deepEqual(harness.sleeps, []);
```

The negative test proves that a same-looking field without `X-` does not update rate-limit values. It prevents tests from repeating the same wrong contract as production.

Preserve the known-state wait test from lines 323-359 and the excessive-reset denial from lines 396-438. Rename their fixtures to `X-Toast-*`.

Preserve cross-location isolation from lines 440-480. A reset for location A must not delay location B.

Reuse `TransportHarness` from lines 2129-2173. It injects a clock, synthetic token fetch, deterministic randomness, and a sleep recorder.

Reuse `jsonResponse` from lines 2225-2236. This keeps headers attached to a real Fetch `Response`, whose header lookup is case-insensitive.

Mutation verification must cover at least these changes:

1. Restore one obsolete non-`X-` production lookup and require the official-name test to fail.
2. Accept one obsolete non-`X-` fixture and require the prefix-negative test to fail.
3. Remove seconds conversion and require the seconds boundary test to fail.
4. Remove milliseconds preservation and require the milliseconds boundary test to fail.
5. Remove the wait ceiling or GUID key and require the existing denial or isolation test to fail.

---

### `docs/research/toast-api-reporting-landscape.md` (documentation, source-to-contract transform)

**Analog:** The same document's verified source-correction pattern at lines 112-142

The location correction names the prior assumption, states the current official contract, describes the implementation consequence, and states what it supersedes. Use that same structure for the reset correction.

Replace the outdated section at lines 326-328. Use a heading with a verification date, not `original implementation note`.

The replacement must state these facts separately:

- Current official Toast documentation names `X-Toast-RateLimit-Limit`, `X-Toast-RateLimit-Remaining`, and `X-Toast-RateLimit-Reset`.
- Toast defines reset as an absolute UNIX-epoch timestamp.
- The cited page does not state the epoch unit.
- The runtime accepts bounded seconds and milliseconds, but never a relative delta.
- Phase 1 corrects the missing `X-` prefix in production and fixtures.

Keep the source-list convention from lines 458-488. The owning official source already appears as `Rate limiting` at line 472.

Do not claim live Toast proof. This document correction is official-source proof for the contract only.

## Shared Patterns

### Authentic protocol boundary

**Sources:** `test/server.test.ts` lines 123-149 and `src/stdio.ts` lines 28-60  
**Apply to:** Both Phase 1 protocol tests and the conditional cancellation fixture

Use the official client, official stdio transport, compiled child process, and official `serveStdio(factory)` boundary. Do not use an in-memory transport or injected server double for GH-4.

### Deterministic cleanup and bounds

**Source:** `test/server.test.ts` lines 31-38 and 202-221  
**Apply to:** All child-process tests

Use `try/finally` for client cleanup. Use bounded timeouts for connect, request, cancellation, and restart operations.

### Synthetic-only data

**Sources:** `test/server.test.ts` lines 11-14 and `test/transport.test.ts` lines 13-27  
**Apply to:** All new tests and fixtures

Use only independently invented credentials, GUIDs, payloads, and cancellation markers. Never record real Merchant Data or secrets.

### Fail-closed state handling

**Sources:** `src/transport.ts` lines 784-881 and 1202-1261  
**Apply to:** Both restaurant-scoped and credential-scoped rate-limit paths

Keep immutable snapshots, strict numeric parsing, bounded waits, and location-separated keys. Invalid or excessive values must not become fabricated safe state.

### Evidence-state separation

**Source:** `AGENTS.md` GSD execution bridge and `LOOP.md` handoff rules  
**Apply to:** The owning PR and issue evidence after implementation

Record implementation, exact-head validation, independent review, production wiring, and external proof as separate claims. Tests do not make the package publish-ready.

## No Full Analog Found

| Pattern | Planned File | Reason | Planner Source |
|---|---|---|---|
| Real SDK handler cancellation observed through `ctx.mcpReq.signal` | `test/fixtures/protocol-cancellation-server.ts` | Production registers no tools, and existing stdio tests inject `fakeServe` only for sanitized wrapper errors. | `01-RESEARCH.md` Pattern 2 and official MCP SDK references |

## Planner Guardrails

1. Do not modify `src/server.ts` or register a production tool in Phase 1.
2. Do not change `package.json` or `package-lock.json`; the exact reviewed dependency graph is sufficient.
3. Do not infer modern request proof from `connect()` or `listTools()`.
4. Do not close GH-4 without handler-side cancellation observation and post-cancel process reuse.
5. Do not close GH-32 until code, fixtures, documentation, exact-head Node gates, and independent review agree.

## Metadata

**Analog search scope:** `src/`, `test/`, `docs/research/`, and repository test infrastructure  
**Code discovery:** codebase-memory graph `search_graph`, `get_code_snippet`, and `trace_path`, followed by targeted source reads  
**Strong analog files:** 5  
**Pattern extraction date:** 2026-08-26
