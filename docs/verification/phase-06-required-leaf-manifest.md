# Phase 06 Required Leaf Manifest

**Canonical source commit:** `761cba89b70c3da96f71cb84b3eaa4ef849438c5`  
**Purpose:** This source-derived manifest names the non-optional atomic leaves
from the product contract, binding safety rules, and architecture constraints.
The audit requires each leaf, its exact source metadata, and its matrix row.

| Requirement ID | Canonical source | Source anchor | Canonical quote |
| --- | --- | --- | --- |
| REQ-PROD-001A | AGENTS.md | AGENTS.md > Binding safety rules | order submission |
| REQ-PROD-001B | AGENTS.md | AGENTS.md > Binding safety rules | payment authorization |
| REQ-PROD-001C | AGENTS.md | AGENTS.md > Binding safety rules | inventory mutation |
| REQ-PROD-001D | AGENTS.md | AGENTS.md > Binding safety rules | labor mutation |
| REQ-PROD-001E | AGENTS.md | AGENTS.md > Binding safety rules | any other Toast write operation in the reporting server. |
| REQ-PROD-002A | AGENTS.md | AGENTS.md > Binding safety rules | client secrets |
| REQ-PROD-002B | AGENTS.md | AGENTS.md > Binding safety rules | bearer tokens |
| REQ-PROD-002D | AGENTS.md | AGENTS.md > Binding safety rules | raw credential payloads |
| REQ-PROD-004G | AGENTS.md | AGENTS.md > Binding safety rules | Do not process Toast Merchant Data with an AI tool or service unless documented Merchant consent exists. |
| REQ-PROD-005A | AGENTS.md | AGENTS.md > Binding safety rules | Analytics guest-payment data |
| REQ-PROD-006A | AGENTS.md | AGENTS.md > Binding safety rules | Every Toast request and every cache key must be explicitly bound to a restaurant GUID |
| REQ-PROD-006C | AGENTS.md | AGENTS.md > Binding safety rules | Never reuse location-scoped data across locations. |
| REQ-PROD-011B | AGENTS.md | AGENTS.md > Binding safety rules | never fabricated zeroes |
| REQ-CONTRACT-001A | AGENTS.md | AGENTS.md > Product contract | `toast-pos-mcp` is a public, read-only Model Context Protocol server |
| REQ-CONTRACT-001B | AGENTS.md | AGENTS.md > Product contract | The initial product is a locally run package. |
| REQ-CONTRACT-001F | AGENTS.md | AGENTS.md > Product contract | must not proxy shared project credentials to third parties. |
| REQ-CONTRACT-001H | AGENTS.md | AGENTS.md > Product contract | it does not authorize AI or third-party processing. |
| REQ-CONTRACT-001I | AGENTS.md | AGENTS.md > Product contract | documented consent from the applicable Merchant |
| REQ-CONTRACT-001J | AGENTS.md | AGENTS.md > Product contract | Toast review or prior-written-consent requirement. |
| REQ-ARCH-002C | AGENTS.md | AGENTS.md > Architecture constraints | uses `@modelcontextprotocol/server` |
| REQ-ARCH-002D | AGENTS.md | AGENTS.md > Architecture constraints | test-only `@modelcontextprotocol/client` |
| REQ-ARCH-002E | AGENTS.md | AGENTS.md > Architecture constraints | Serve process stdio through the official `serveStdio(factory)` entry |
| REQ-ARCH-002F | AGENTS.md | AGENTS.md > Architecture constraints | legacy 2025 and supported 2026-era clients share one reviewed local transport boundary. |
| REQ-ARCH-003E | AGENTS.md | AGENTS.md > Architecture constraints | `stdio` is the initial transport. |
| REQ-ARCH-004A | AGENTS.md | AGENTS.md > Architecture constraints | Toast transport |
| REQ-ARCH-004B | AGENTS.md | AGENTS.md > Architecture constraints | authentication |
| REQ-ARCH-004C | AGENTS.md | AGENTS.md > Architecture constraints | pagination |
| REQ-ARCH-004D | AGENTS.md | AGENTS.md > Architecture constraints | Analytics report-job lifecycle |
| REQ-ARCH-004E | AGENTS.md | AGENTS.md > Architecture constraints | normalization |
| REQ-ARCH-004F | AGENTS.md | AGENTS.md > Architecture constraints | report calculation |
| REQ-ARCH-004G | AGENTS.md | AGENTS.md > Architecture constraints | MCP presentation layers. |
| REQ-ARCH-005B | AGENTS.md | AGENTS.md > Architecture constraints | Support Standard API and Analytics API through distinct adapters. |
| REQ-ARCH-010A | AGENTS.md | AGENTS.md > Architecture constraints | Local `stdio` does not bypass Merchant consent |
| REQ-ARCH-010B | AGENTS.md | AGENTS.md > Architecture constraints | Toast third-party-provider requirements |
| REQ-ARCH-010C | AGENTS.md | AGENTS.md > Architecture constraints | AI restrictions |
| REQ-ARCH-010D | AGENTS.md | AGENTS.md > Architecture constraints | logging review |
| REQ-ARCH-010E | AGENTS.md | AGENTS.md > Architecture constraints | retention review. |
