# Phase 6: T6-003 package and installed-artifact evidence - Research

**Researched:** 2026-08-27
**Domain:** npm package artifact validation and MCP stdio executable proof
**Confidence:** MEDIUM

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** State implemented behavior, synthetic-test evidence, and remaining
  external gates separately for every public capability claim.
- **D-02:** Do not state or imply Toast approval, certification, partnership,
  sponsorship, endorsement, legal approval, Merchant consent, or publication.
- **D-03:** Link to the current Toast API Terms. Record the observed Terms date.
  Treat public brand-feature approval as a human or Toast gate.
- **D-04:** Put the operator consent, credential, provider, logging, retention,
  subprocessor, and no-training obligations before configuration guidance.
- **D-05:** Explain that the consent acknowledgment environment variable is not
  proof of legal sufficiency.
- **D-06:** Preserve the guest-linked and guest-payment exclusions at the
  request boundary.
- **D-07:** List the real Standard report tools and distinguish them from the
  body-free Analytics lifecycle tool.
- **D-08:** State that `toast_analytics_metrics_day` returns only `denied` or
  `incomplete` envelopes while T5-003-G01 remains unresolved.
- **D-09:** Keep T5-003-G01, first-tool-request cancellation, live Standard and
  Analytics compatibility, installed-artifact smoke, signing, and publication
  as open gates.

### the agent's Discretion

Use the existing Markdown documentation structure. Add one focused
documentation contract test only if it prevents a durable mismatch between the
registered public tools and public wording.

### Deferred Ideas (OUT OF SCOPE)

- T6-003 owns package tarball, installed executable, stdio host, signing, and
  publication evidence.
- T5-003-G01 owns a verified complete Analytics result contract.
- Owner-authorized live Standard and Analytics access remain external gates.

## Project Constraints (from AGENTS.md)

- Keep the reporting server structurally read-only. [VERIFIED: `AGENTS.md`]
- Do not capture secrets or Merchant Data in tests, logs, evidence, or fixtures. [VERIFIED: `AGENTS.md`]
- Use independently invented synthetic fixture values only. [VERIFIED: `AGENTS.md`]
- Keep Merchant consent, third-party processing, and no-training obligations explicit. [VERIFIED: `AGENTS.md`]
- Keep guest-linked and guest-payment data outside every request and result path. [VERIFIED: `AGENTS.md`]
- Keep location state restaurant-bound, reports deterministic, and capability failures fail-closed. [VERIFIED: `AGENTS.md`]
- Use Node.js 20 or later, MCP SDK v2, and the official `serveStdio(factory)` boundary. [VERIFIED: `AGENTS.md`; VERIFIED: `src/stdio.ts`]
- Do not publish, sign, use live credentials, resolve G01, close #28, or close first-tool-request cancellation in this slice. [VERIFIED: `LOOP.md`; VERIFIED: GitHub issue #22]

## Summary

T6-003 must prove the package that npm creates, not only the source checkout. The current package exposes the `toast-pos-mcp` bin at `dist/index.js`, runs `prepack` before packing, and includes `dist` plus `README.md` through its package files policy. [VERIFIED: `package.json`] npm documents that `npm pack` creates a current-package tarball and that `npm install <tarball>` installs a local `.tgz`. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/; CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/]

The installed-executable test must start `consumer/node_modules/.bin/toast-pos-mcp`, then use the pinned v2 test-only MCP client with `StdioClientTransport`, modern `2026-07-28` negotiation, `listTools()`, and `callTool()`. [VERIFIED: `package.json`; VERIFIED: `test/support/report-tools-e2e-support.ts`; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md] The source executable creates one runtime before `serveStdio` begins, so a synthetic report result needs a test-only process preload that replaces global `fetch` before the executable loads. [VERIFIED: `src/index.ts`; VERIFIED: `src/runtime.ts`; VERIFIED: `src/auth.ts`; VERIFIED: `src/transport.ts`]

**Primary recommendation:** Add one isolated package-artifact E2E test and one external-only synthetic fetch preload. Run it after an authentic exact-head `npm ci`, a real tarball build, and an empty-consumer install. [VERIFIED: GitHub issue #22; VERIFIED: `package.json`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Exact-head dependency restoration | Build / package manager | npm registry | The committed lockfile fixes the checkout dependency graph. [VERIFIED: `package-lock.json`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/] |
| Tarball creation and path scan | Build / package manager | Archive utility | `npm pack` creates the tested artifact, and the archive listing proves its paths. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/] |
| Empty-consumer install | Build / package manager | Consumer filesystem | The consumer must install the `.tgz`, not link to the repository. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/] |
| Installed stdio negotiation and tool discovery | Installed executable | MCP client | The package bin starts the official stdio server; the test-only client acts as an independent consumer. [VERIFIED: `package.json`; VERIFIED: `src/index.ts`; VERIFIED: `src/stdio.ts`] |
| Representative synthetic report invocation | Installed executable | Test-only fetch preload | The production executable has no transport injection option. The preload supplies invented responses outside the tarball. [VERIFIED: `src/index.ts`; VERIFIED: `src/runtime.ts`; VERIFIED: `test/fixtures/stdio-report-server.ts`] |
| Publication, signing, live proof, and external approval | Human / external gate | — | Local artifact evidence cannot supply these authorities. [VERIFIED: `LOOP.md`; VERIFIED: GitHub issue #22] |

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|---|---:|---|---|
| Node.js | 20.20.2 and 22.22.2 | Required clean-install validation runtimes | Earlier exact-head evidence used both campaign runtimes. [VERIFIED: `LOOP.md`] |
| npm | 10.9.2 | Restore locked dependencies and make the `.tgz` | The package declares this package-manager baseline. [VERIFIED: `package.json`] |
| `@modelcontextprotocol/server` | 2.0.0 | Packaged stdio server runtime | The official SDK identifies v2 as the stable line. [VERIFIED: npm registry; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md] |
| `@modelcontextprotocol/client` | 2.0.0 | Test-only installed-artifact MCP client | The current E2E harness already uses this exact client package. [VERIFIED: npm registry; VERIFIED: `package.json`; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md] |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| `npm pack --dry-run --json` | Inspect npm's proposed file list | Run before building the real artifact. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/] |
| `npm pack --json --pack-destination <temp>` | Build the tested artifact | Run after the exact-head repository gate. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/] |
| `tar -tzf` and `shasum -a 512` | Record archive paths and checksum | Run only on the temp tarball. [VERIFIED: local environment probe, 2026-08-27] |
| Existing Node test runner | Execute the package-artifact E2E test | Use the existing compiled `node:test` workflow. [VERIFIED: `package.json`; VERIFIED: `scripts/run-tests.mjs`] |

**Installation:** Do not add a package dependency. Use the committed lockfile for the temporary clean restore and consumer installation. [VERIFIED: GitHub issue #22; VERIFIED: `package-lock.json`]

## Package Legitimacy Audit

The slice adds no third-party package. It restores the existing committed lockfile and installs the local tarball into a temporary consumer. [VERIFIED: `package.json`; VERIFIED: GitHub issue #22]

| Package | Registry / source | Verdict | Disposition |
|---|---|---|---|
| `@modelcontextprotocol/server` | npm; official SDK repository | OK | Existing exact pin `2.0.0` is approved. [VERIFIED: npm registry; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md] |
| `@modelcontextprotocol/client` | npm; official SDK repository | OK | Existing test-only exact pin `2.0.0` is approved. [VERIFIED: npm registry; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md] |
| `zod` | npm | OK | Existing production exact pin remains unchanged. [ASSUMED] |
| `typescript` | npm | OK | Existing development exact pin remains unchanged. [ASSUMED] |
| `@types/node` | npm | SUS: latest release is too new | Keep the locked `20.19.43` version unchanged. Add `checkpoint:human-verify` before a fresh clean restore if registry metadata changes. [ASSUMED] |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: package-legitimacy seam]

**Packages flagged as suspicious [SUS]:** `@types/node`; the seam based this on its newest registry release, not the locked version. Do not upgrade it in T6-003. [VERIFIED: package-legitimacy seam; VERIFIED: `package-lock.json`]

## Architecture Patterns

### System Architecture Diagram

```text
exact commit
    |
    v
fresh temporary checkout -- npm ci --> npm run check
    |
    v
npm pack --dry-run --json --> path allowlist scan
    |
    v
npm pack --> checksum + tar path record --> empty temporary consumer
                                                |
                                                v
                                      npm install local .tgz
                                                |
                                                v
test-only MCP client --> consumer .bin executable --> serveStdio(factory)
                                                |
                                                +--> listTools()
                                                |
                                                +--> test-only preload --> invented fetch responses
                                                                            |
                                                                            v
                                                               representative report envelopes
```

### Pattern 1: Clean artifact isolation

**What:** Make a new temporary worktree at the exact candidate SHA. Put the tarball and consumer project in separate temporary directories. [VERIFIED: GitHub issue #22]

**When to use:** Use for every candidate. Never pack from a dirty checkout or install by `npm link`. [VERIFIED: `AGENTS.md`; CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/]

**Required command sequence:**

```sh
git worktree add --detach "$CANDIDATE_DIR" "$CANDIDATE_SHA"
(cd "$CANDIDATE_DIR" && npm ci --no-audit --no-fund && npm run check)
(cd "$CANDIDATE_DIR" && npm pack --dry-run --json)
(cd "$CANDIDATE_DIR" && npm pack --json --pack-destination "$ARTIFACT_DIR")
(cd "$CONSUMER_DIR" && npm init -y && npm install --ignore-scripts --no-save "$TARBALL")
```

This creates no publication or signing action. [VERIFIED: GitHub issue #22]

### Pattern 2: Installed executable, not repository source

**What:** Configure `StdioClientTransport.command` with the absolute `consumer/node_modules/.bin/toast-pos-mcp` path. [VERIFIED: `package.json`; VERIFIED: `test/support/report-tools-e2e-support.ts`]

**When to use:** Use for protocol negotiation, discovery, and calls. Do not use `dist/index.js` in the source checkout or the test fixture server as the command. [VERIFIED: GitHub issue #22]

### Pattern 3: External synthetic fetch preload

**What:** Add a compiled test-only preload that assigns an invented fetch handler before `dist/index.js` constructs its runtime. Pass its absolute path through `NODE_OPTIONS=--import=<preload>`. [ASSUMED]

**When to use:** Use only from the package-artifact test. The preload must live in `test/` and must not enter the tarball. It must reuse or extract the existing invented route assertions from `test/fixtures/stdio-report-server.ts`. [VERIFIED: `test/fixtures/stdio-report-server.ts`; VERIFIED: `package.json`]

**Required assertions:** list all six registered tools; call at least one Standard summary through a complete invented route; call one other Standard family or a denied boundary; and call Analytics only as the body-free denied/incomplete envelope. [VERIFIED: `src/report-tools.ts`; VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: GitHub issue #22]

### Anti-Patterns to Avoid

- **Source-path smoke:** Do not spawn `dist/index.js` from the repository. It does not prove the installed bin. [VERIFIED: GitHub issue #22]
- **Directory link:** Do not use `npm link` or a consumer path link. It can bypass tarball inclusion rules. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/]
- **Test fixture in package:** Do not put `test/`, `dist-test/`, synthetic secrets, `.env`, logs, or git files in the tarball. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22]
- **Gate collapse:** Do not mark #28, G01, first-tool-request cancellation, signing, or publication complete after synthetic package proof. [VERIFIED: `LOOP.md`; VERIFIED: GitHub issue #22]

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|---|---|---|---|
| Package assembly | Custom file copier | `npm pack` | npm is the artifact producer that publication would use. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/] |
| Consumer installation | Symlink-based smoke | `npm install <absolute .tgz>` | npm installs a filesystem tarball as a package. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/] |
| MCP wire client | Handwritten JSON-RPC framing | Existing pinned `StdioClientTransport` harness | It proves the supported client negotiation path. [VERIFIED: `test/support/report-tools-e2e-support.ts`; CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md] |
| Synthetic Toast proof | Live Toast access or copied Merchant data | Existing invented fixture routes and a test-only preload | This preserves consent, data, and external-gate rules. [VERIFIED: `AGENTS.md`; VERIFIED: `test/fixtures/stdio-report-server.ts`] |

## Common Pitfalls

### Pitfall 1: The tarball differs from the source test target

**What goes wrong:** Source tests pass while the package misses the bin target, runtime files, documentation, or dependencies. [VERIFIED: GitHub issue #22]

**How to avoid:** Build the real tarball after `npm run check`, install it in an empty consumer, and start the installed `.bin` command. [VERIFIED: GitHub issue #22]

### Pitfall 2: The executable reaches a network endpoint

**What goes wrong:** The source executable captures default `fetch` during runtime construction and would otherwise use the configured hostname. [VERIFIED: `src/index.ts`; VERIFIED: `src/runtime.ts`; VERIFIED: `src/auth.ts`]

**How to avoid:** Use a test-only preload with invented values and explicit route assertions. Do not use real credentials, hostnames, or Merchant Data. [VERIFIED: `AGENTS.md`; ASSUMED]

### Pitfall 3: Artifact evidence changes release authority

**What goes wrong:** A local `.tgz` pass is described as signing, publication, live compatibility, or legal approval. [VERIFIED: `LOOP.md`; VERIFIED: GitHub issue #22]

**How to avoid:** Record `READY_FOR_HUMAN_GATE` only after the defined local evidence. Keep every external gate as open. [VERIFIED: GitHub issue #22]

## Code Examples

```ts
// Test-only. Spawn the installed package bin from the empty consumer.
const transport = new StdioClientTransport({
  command: installedBin,
  cwd: consumerDirectory,
  stderr: "pipe",
  env: { ...syntheticEnv, NODE_OPTIONS: `--import=${preloadPath}` },
});
const client = new Client({ name: "package-artifact-e2e", version: "0.0.0" }, {
  versionNegotiation: { mode: { pin: "2026-07-28" }, probe: { timeoutMs: 10_000 } },
});
await client.connect(transport);
const tools = await client.listTools();
const result = await client.callTool({
  name: "toast_sales_summary",
  arguments: { businessDate: 20260816 },
});
```

The client pattern is the current local E2E pattern. The preload mechanism needs a focused implementation check before it becomes a locked plan detail. [VERIFIED: `test/support/report-tools-e2e-support.ts`; ASSUMED]

## State of the Art

| Old approach | Current approach | Impact |
|---|---|---|
| `npm pack --dry-run` only | Dry-run plus real `.tgz` install and executable stdio test | Dry-run cannot prove consumer installation or bin execution. [VERIFIED: GitHub issue #22; CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/] |
| Direct report function tests | Production stdio tests plus installed-artifact proof | The candidate must prove its package boundary. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Node `--import` through `NODE_OPTIONS` loads a test-only preload before the bin creates its runtime. | Architecture Patterns | The installed artifact test needs another isolated child-process injection method. |
| A2 | The current synthetic route fixture can be extracted into a reusable fetch handler without changing product runtime behavior. | Architecture Patterns | The test may need a separate minimal invented route implementation. |
| A3 | The package-legitimacy seam's `@types/node` SUS result applies to the newest release, not the committed `20.19.43` lock entry. | Package Legitimacy Audit | A human must verify before fresh restoration if metadata changes. |

## Open Questions

1. **Does the pinned MCP client preserve `NODE_OPTIONS` in the spawned executable environment?**
   - What we know: The existing client already spawns a command through `StdioClientTransport`. [VERIFIED: `test/support/report-tools-e2e-support.ts`]
   - What's unclear: The installed-artifact test must confirm environment forwarding. [ASSUMED]
   - Recommendation: Make this the first test assertion. If it fails, use a temporary wrapper executable outside the tarball. [ASSUMED]

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js 20.20.2 | Supported floor gate | ✗ | — | Install or select the authentic Node 20 runtime. [VERIFIED: local environment probe, 2026-08-27] |
| Node.js 22.22.2 | Compatibility gate | ✗ | — | Install or select the authentic Node 22 runtime. [VERIFIED: local environment probe, 2026-08-27] |
| Node.js | Local exploratory runtime | ✓ | 25.9.0 | Do not use as a substitute for required evidence. [VERIFIED: local environment probe, 2026-08-27] |
| npm | Clean restore and pack | ✓ | 11.12.1 | Do not substitute for the declared npm 10.9.2 without recording the difference. [VERIFIED: local environment probe, 2026-08-27; VERIFIED: `package.json`] |
| `tar`, `shasum`, `jq` | Artifact evidence parsing | ✓ | bsdtar 3.5.3; shasum 6.02; jq 1.8.1 | — [VERIFIED: local environment probe, 2026-08-27] |

**Missing dependencies with no fallback:** authentic Node 20.20.2 and Node 22.22.2. [VERIFIED: `LOOP.md`; VERIFIED: local environment probe, 2026-08-27]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node built-in test runner, compiled through TypeScript. [VERIFIED: `package.json`; VERIFIED: `scripts/run-tests.mjs`] |
| Config file | `tsconfig.test.json`. [VERIFIED: `package.json`] |
| Quick run command | `npm run build:test && node --test --enable-source-maps dist-test/test/package-artifact-e2e.test.js`. [ASSUMED] |
| Full suite command | `npm ci --no-audit --no-fund && npm run check`. [VERIFIED: `package.json`] |

### Phase Requirements → Test Map

| Behavior | Test type | Automated command | File exists? |
|---|---|---|---|
| Exact-head clean restore and full repository gate | integration evidence | `npm ci --no-audit --no-fund && npm run check` on Node 20 and Node 22 | ❌ evidence run |
| Package dry-run and complete path allowlist | integration evidence | `npm pack --dry-run --json` plus JSON path assertions | ❌ Wave 0 |
| Tarball install into empty consumer | E2E | focused package-artifact test | ❌ Wave 0 |
| Installed bin negotiation, discovery, and synthetic report calls | E2E | focused package-artifact test | ❌ Wave 0 |
| Tarball checksum and evidence record | integration evidence | `shasum -a 512 "$TARBALL"` and `tar -tzf "$TARBALL"` | ❌ evidence run |

### Wave 0 Gaps

- [ ] `test/package-artifact-e2e.test.ts` — exact tarball, empty consumer, bin, stdio, and output assertions. [ASSUMED]
- [ ] `test/fixtures/installed-artifact-fetch-preload.ts` — invented fetch routes outside the package. [ASSUMED]
- [ ] Extract reusable invented route handlers from `test/fixtures/stdio-report-server.ts` if needed. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control |
|---|---|---|
| V2 Authentication | Yes | Synthetic credentials only; no secret output. [VERIFIED: `AGENTS.md`] |
| V3 Session Management | Yes | Run each executable in an isolated temporary process. [ASSUMED] |
| V4 Access Control | Yes | Retain capability denials and restaurant-bound inputs. [VERIFIED: `AGENTS.md`; VERIFIED: `src/analytics-report-tools.ts`] |
| V5 Input Validation | Yes | Invoke valid synthetic inputs and assert the existing MCP schemas. [VERIFIED: `src/report-tools.ts`; VERIFIED: `src/analytics-report-tools.ts`] |
| V6 Cryptography | No new control | Do not add a signing or cryptography claim. [VERIFIED: `LOOP.md`] |

### Known Threat Patterns

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| Secret or Merchant Data enters evidence | Information disclosure | Invented fixtures, temp cleanup, and no raw stderr capture in durable files. [VERIFIED: `AGENTS.md`] |
| Development files enter the tarball | Tampering | Assert an explicit packaged-path allowlist and reject `.env`, `test`, source, logs, and VCS paths. [VERIFIED: GitHub issue #22] |
| Local pass becomes a publication claim | Spoofing | Record local evidence separately from signing, publication, and human approvals. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22] |

## Sources

### Primary

- [npm pack documentation](https://docs.npmjs.com/cli/v11/commands/npm-pack/) — tarball creation, JSON, dry-run, and destination. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/]
- [npm install documentation](https://docs.npmjs.com/cli/v11/commands/npm-install/) — local tarball installation. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-install/]
- [MCP TypeScript SDK README](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md) — v2 packages and stdio client/server context. [CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md]
- GitHub issue #22 and `LOOP.md` — exact slice requirements and retained gates. [VERIFIED: GitHub issue #22; VERIFIED: `LOOP.md`]

## Metadata

**Confidence breakdown:**

- Standard stack: MEDIUM — official npm and MCP documentation support the tools; the declared runtime matrix comes from the campaign ledger. [CITED: https://docs.npmjs.com/cli/v11/commands/npm-pack/; VERIFIED: `LOOP.md`]
- Architecture: MEDIUM — the installed-bin path is codebase-verified; the preload detail needs a first test proof. [VERIFIED: `src/index.ts`; ASSUMED]
- Pitfalls: HIGH — issue #22 and repository rules directly identify package-boundary and gate risks. [VERIFIED: GitHub issue #22; VERIFIED: `AGENTS.md`]

**Research date:** 2026-08-27

**Valid until:** 2026-09-03 because npm, Node, and MCP runtime behavior are fast-moving. [ASSUMED]
