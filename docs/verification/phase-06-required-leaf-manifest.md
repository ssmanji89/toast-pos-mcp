# Phase 06 Required Leaf Manifest

**Canonical source commit:** `761cba89b70c3da96f71cb84b3eaa4ef849438c5`

This manifest derives its required leaf sets from the canonical source domain,
anchor, and stable requirement-ID prefix. Each digest covers every atomic leaf
as `ID`, source, anchor, and exact quote. The audit rejects a missing or added
canonical leaf in any domain.

| Domain | Canonical source | Source anchor | Requirement ID prefix | Expected leaf count | Leaf digest |
| --- | --- | --- | --- | --- | --- |
| Product contract | AGENTS.md | AGENTS.md > Product contract | REQ-CONTRACT- | 10 | f98c522fa3c58d205d330874768a6a0a0988543c6366bb5186ee8993e3918bb7 |
| Binding safety rules | AGENTS.md | AGENTS.md > Binding safety rules | REQ-PROD- | 52 | 60e877284047d74a36cbd3350ba5e1639750bd936b839611401e5f32779ee50c |
| Architecture constraints | AGENTS.md | AGENTS.md > Architecture constraints | REQ-ARCH- | 45 | 4e7b25b01a8e26e06f1f46c3b48b44d89450bf662b0037fee38614f8804f6542 |
| GSD delivery rules | AGENTS.md | AGENTS.md > GSD execution bridge | REQ-DEL- | 5 | 4d2ff1f4326810a5711a6b2b611243ccf832e0c74991dfc6729189d04cf68630 |
| Delivery standard | AGENTS.md | AGENTS.md > Delivery standard | REQ-DEL- | 2 | 8022c2eaa68a2fc9279c1cc63c5ab829d04a44ce3aeaaf8936cbbbe6151c8a8f |
| Documentation check | AGENTS.md | AGENTS.md > Documentation check (DOX) | REQ-DEL- | 1 | 07a300fcc29bf57df3d71265169cced18def08de3c1ae444208c036e93e076da |
