# Claude Code public-preview verification

**Issue:** #74 / T6-004  
**GSD plan:** Phase 06 Plan 06-09  
**Plugin version:** `0.1.0-preview.1`

## Evidence classes

| Class | Required evidence | Current state |
| --- | --- | --- |
| Source contract | Parse manifests and MCP config; verify secure configuration, exact environment, marketplace/version coherence, and docs/skill/feedback wording. | Built in `scripts/validate-claude-preview-plugin.mjs`; execution result belongs in PR evidence. |
| Launcher behavior | Compile once with a fake pinned compiler, preserve stdout, reuse cache, fail generically without leaking a secret marker. | Built in `test/claude-preview-plugin.test.ts`; execution result belongs in PR evidence. |
| Repository regression | Authentic committed-lockfile `npm run check`, installed-artifact test, requirements audit, and diff check. | Pending immutable-candidate execution. |
| Claude schema | `claude plugin validate . --strict`. | Pending an executor with the real Claude CLI. |
| Marketplace install | Add local/GitHub marketplace, install disabled plugin, enable through real userConfig, reload, inspect details. | Pending an executor with the real Claude CLI. |
| MCP operation | Confirm server connected and invoke one representative synthetic Standard report through the installed cached plugin. | Pending an executor with the real Claude CLI. |
| Live Toast | Sanitized owner-authorized compatibility feedback. | External; not required for preview wrapper source merge unless repository policy later raises the gate. |
| Publication/approval | npm, GitHub Release, signing, Toast/brand/legal authority. | External and explicitly not performed by T6-004. |

## Static invariants

- The plugin installs disabled.
- The marketplace exposes one versioned plugin from the repository root.
- `claude-plugin.mcp.json` exposes one Node stdio server.
- The MCP environment includes only the Standard runtime values reviewed by T1/T2.
- Credential-shaped plugin options use Claude sensitive storage.
- The launcher contains no shell and no Toast credential variable name.
- The launcher imports the existing compiled runtime and contains no tool registration or report formula.
- Analytics credentials are absent from the preview configuration.
- The reporting skill preserves complete, incomplete, and denied semantics.
- Feedback instructions prohibit credentials, Merchant Data, guest data, and raw API bodies.

## Operational gate record

Do not fill this section from static validation.

- Candidate SHA: pending
- Claude Code version: pending
- Node/npm versions: pending
- `claude plugin validate . --strict`: pending
- marketplace add/install/enable/reload: pending
- plugin details: pending
- MCP connection: pending
- discovered tools: pending
- synthetic report status/provenance: pending
- cleanup/uninstall: pending
- reviewer disposition: pending
