# Claude Code public preview

**Plugin version:** `0.1.0-preview.1`  
**Distribution:** repository-hosted Claude Code marketplace  
**Status:** public preview, not Toast-approved or production-certified

This preview packages the existing local, read-only Toast POS MCP runtime as a Claude Code plugin. It does not publish the runtime to npm. Claude Code copies the repository-root plugin into its versioned cache, restores the committed npm lockfile with lifecycle scripts disabled, and starts the MCP server through a cache-local Node launcher.

## Prerequisites

- Claude Code with plugin marketplace support.
- Node.js 20 or later and npm available on `PATH`.
- Network access to GitHub and the npm registry during installation.
- Operator-owned Toast Standard API credentials authorized for the restaurant being queried.
- Documented Merchant consent and the required Toast/provider review before Merchant Data is processed by Claude or another AI service.

The plugin installs disabled and asks for its required configuration when enabled. Sensitive configuration is stored through Claude Code's sensitive plugin storage rather than ordinary project settings.

## Install

In Claude Code:

```text
/plugin marketplace add ssmanji89/toast-pos-mcp
/plugin install toast-pos-mcp@toast-pos-mcp-preview
/plugin enable toast-pos-mcp@toast-pos-mcp-preview
/reload-plugins
```

The enable step prompts for:

- bare Toast Standard API hostname;
- Toast client ID;
- Toast client secret;
- one authorized default restaurant GUID;
- explicit acknowledgment that Merchant AI-processing consent is documented.

`TOAST_ACCESS_TYPE` is fixed to `TOAST_MACHINE_CLIENT`. The public-preview wrapper does not ask for Analytics credentials because the completed Analytics result contract remains vendor-unverified.

## Verify the installation

1. Run `/plugin details toast-pos-mcp@toast-pos-mcp-preview` and confirm one MCP server plus the `toast-reporting` skill are listed.
2. Run `/mcp` and confirm `toast-pos-reporting` is connected.
3. Ask Claude to use `toast_sales_summary` for a known authorized restaurant and business date.
4. Compare the result with an operator-known Toast report before relying on it operationally.

On the first start of each plugin version, the launcher compiles the exact cached TypeScript source with the lockfile-pinned compiler into a versioned cache under `node_modules/.cache`. Compilation reserves stdout for MCP framing and emits only a generic startup error on failure.

## Result boundaries

- Standard tools may return `complete` or `denied`.
- Labor may return `complete`, `incomplete`, or `denied`.
- `toast_analytics_metrics_day` remains experimental and body-free. It returns only `incomplete` or `denied` until Toast resolves the completed-result schema ambiguity.
- A denied or incomplete result is never a zero-value report.

## Update

After a preview version is published in the marketplace manifest:

```text
/plugin marketplace update toast-pos-mcp-preview
/plugin update toast-pos-mcp@toast-pos-mcp-preview
/reload-plugins
```

## Troubleshooting

- **Plugin dependency warning:** ensure npm can reach the registry and that local npm configuration does not omit development dependencies; the pinned TypeScript compiler is required for the first cache-local build.
- **Generic startup failure:** verify Node.js is at least version 20, then inspect Claude Code debug output for the dependency-install warning. The wrapper deliberately does not print credential-bearing configuration or caught compiler details.
- **Configuration failure:** disable and re-enable the plugin to correct the prompted options. Do not put credentials in repository files or issue reports.
- **Denied report:** inspect the stable denial code. Common causes are missing scope, inaccessible restaurant, stale or unavailable source context, malformed source data, or cancellation.

## Feedback

Use the repository's Claude preview issue form. Do not include credentials, bearer tokens, Merchant Data, guest data, or raw Toast API bodies. Include only sanitized protocol facts, the plugin version, Claude Code version, Node/npm versions, tool name, result status/code, and an operator-described expected-versus-observed outcome.
