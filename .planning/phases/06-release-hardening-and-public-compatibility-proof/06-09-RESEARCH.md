# Phase 06 Plan 09 research: Claude Code public-preview distribution

**Date:** 2026-08-31  
**Issue:** #74 / T6-004  
**Scope:** distribution wrapper only; existing report runtime and formulas remain unchanged

## GSD decision

GSD's phase loop is discuss, plan, execute, verify, and ship. The repository already completed the implementation-heavy phases and has authentic installed-artifact evidence. The remaining local engineering gap is distribution into the intended Claude host, not another reporting subsystem. Plan 06-09 therefore adds one bounded Phase 6 public-preview wrapper and keeps the actual Claude CLI install as the final verify checkpoint.

## Current system facts

- `src/index.ts` constructs one process-owned `ApplicationRuntime` and starts the official MCP v2 stdio boundary.
- `src/server.ts` registers five Standard tools and the separate Analytics lifecycle tool against that exact runtime.
- The committed npm lockfile pins the MCP SDK, Zod, TypeScript, and Node types.
- The runtime package remains private and unpublished. Prior package evidence installs a real tarball into an empty consumer, but no public distribution channel exists.
- The Analytics completed-result contract remains blocked by T5-003-G01. The preview may expose only the existing body-free `incomplete`/`denied` Analytics lifecycle boundary.

## Claude Code distribution facts

Current Claude Code plugin documentation establishes these relevant contracts:

1. A marketplace is hosted through `.claude-plugin/marketplace.json`; users add a GitHub repository and install `plugin@marketplace`.
2. Marketplace-installed plugins are copied into a versioned local cache. A relative plugin source is resolved within the marketplace repository and cannot access files outside its plugin directory.
3. A plugin manifest may point to a custom MCP configuration. Plugin MCP servers start when the plugin is enabled.
4. `defaultEnabled: false` is intended for opt-in integrations with external scope or cost.
5. `userConfig` prompts at enable time. Sensitive values are masked and stored in secure storage. Values are substituted into MCP server configuration as `${user_config.KEY}`.
6. When a copied plugin root includes `package.json` plus `package-lock.json`, Claude Code runs `npm ci --ignore-scripts` in the versioned cache. Resolution is frozen; lifecycle scripts do not run; the dependency install has a bounded timeout.
7. Plugin updates with explicit versions require a manifest version bump. `/reload-plugins` switches a running session to the new MCP configuration and path.

## Chosen architecture

### Repository-root plugin source

The marketplace entry uses `source: "./"`. This copies the exact repository root, including source, TypeScript configuration, package manifest, and committed lockfile. It avoids duplicating the runtime in a plugin subdirectory and prevents a second report implementation from drifting away from the reviewed source.

### Custom MCP config, not project `.mcp.json`

The manifest points to `claude-plugin.mcp.json`. A root `.mcp.json` would also look like project-local MCP configuration to contributors who clone the repository. The custom path keeps plugin distribution separate from ordinary repository execution.

### Secure opt-in configuration

The plugin installs disabled. Enabling it prompts for the Standard API hostname, client ID, client secret, default restaurant GUID, and explicit Merchant-consent acknowledgment. Client ID, secret, and GUID use sensitive storage. The access type remains fixed to `TOAST_MACHINE_CLIENT`.

Analytics credentials are not exposed in the preview configuration. That avoids presenting an unfinished completed-result contract as a general-user feature and avoids an all-or-none optional environment group in the first wrapper.

### Cache-local compilation

Claude Code's automatic dependency install disables lifecycle scripts, so `prepack` cannot build `dist`. A small no-shell launcher invokes the lockfile-pinned TypeScript compiler directly on first start of each plugin version. Generated output lives under `node_modules/.cache/toast-pos-mcp-preview/<version>/dist`, so it resolves the already-installed runtime dependencies and remains isolated to the cached plugin version.

The launcher:

- requires Node 20 or later;
- never reads or interpolates Toast credentials;
- serializes concurrent first-start compilation with a bounded stale lock;
- reserves stdout for MCP JSON-RPC;
- suppresses compiler output and exposes only one generic startup error;
- imports the existing compiled `src/index.ts` runtime rather than registering tools itself.

## Alternatives rejected

| Alternative | Rejection reason |
| --- | --- |
| Publish `toast-pos-mcp` to npm first | Publication, signing, brand, and human authority remain separate gates; the user asked for a Claude preview, not an npm release. |
| Use `npx` against GitHub or an unpublished package | Adds network resolution on every start and weakens exact-source reproducibility. |
| Add a shell install hook | Creates quoting/platform risk, executes mutable shell behavior, and duplicates Claude's frozen dependency restore. |
| Commit a second compiled runtime under a plugin directory | Duplicates reviewed source and creates an immediate coherence problem. |
| Point to a project-level `.mcp.json` | Blurs contributor project configuration with distributable plugin configuration. |
| Add Analytics credentials to preview config | Suggests completed Analytics output is ready when G01 still blocks it. |
| Enable by default | External credentials and AI-processing consent require explicit operator opt-in. |

## Verification strategy

Local repository evidence must include:

- JSON parsing and cross-file static contract validation;
- launcher compile-once behavior, cache reuse, stdout cleanliness, and generic failure proof;
- full `npm run check` on supported Node versions when the branch reaches candidate state;
- existing installed-artifact and report-wiring suites remaining green;
- `claude plugin validate . --strict` plus real marketplace add/install/enable/reload/MCP connection in an environment with Claude Code;
- a representative synthetic report invocation through the installed plugin, without live credentials or Merchant Data;
- fresh independent exact-head review before merge.

The current web executor has Node and npm but no Claude CLI or registry/network path suitable for an authentic install. That is an explicit verification checkpoint, not permission to replace Claude with a custom parser.
