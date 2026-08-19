# DSH Migration File Owner Manifest

One integration owner controls shared contracts and release truth. Workstream owners may change only their assigned surfaces; a discovered contract gap returns to the integration owner and does not create a local alias or parallel wire shape.

| Surface | Canonical owner | Planned files | Forbidden ownership |
| --- | --- | --- | --- |
| Product Agent and bridge contracts | Integration owner / `@neko/agent-contracts` | `packages/agent/contracts/src/dsh-*` and public barrel | Desktop-local DTOs, bridge-private copies, Renderer schemas |
| Host-neutral ACP application client and projection | W1 / `@neko/agent-runtime` | `packages/agent/runtime/src/acp/**` | Electron process spawning, Cordis, DSH package internals |
| Official DSH bridge plugin and profile | W1 / `@neko/dsh-bridge` | `packages/dsh-bridge/**` | Agent loop, Session store, inbox state copy, domain facts |
| Desktop subprocess and stdio transport | W1 / Desktop Main | `apps/neko-desktop/src/main/desktop-dsh-*` | Agent/Session policy, transcript parsing, extension authority |
| Generation and Canvas Tool contracts/adapters | W2 / owning domain packages plus W1 bridge registration | owning package public contracts; bridge Tool adapters | MCP wrappers, Desktop business validation, duplicated domain facts |
| Official extension projection and commands | W3 / bridge contract plus DSH-owned profile | bridge extension modules and Agent projection consumers | OpenNeko Skill Host, MCP Manager, Plugin runtime or catalog mirror |
| Product contract and Desktop consumer cutover | W4 / `@neko/agent-contracts`, Agent Webview and Desktop composition | exact consumers named by D0 replacement inventory | compatibility fields, Pi aliases, dual registrations |
| Conversation catalog and retired-data protection | W5 / Agent application catalog owner | lifecycle repository/service and byte fixtures | transcript decode, Pi migration, auto-created DSH Session fallback |
| Remaining domain Tools | W6 / each owning domain | package-owned contracts and Host adapters | generic Tool business router or MCP conversion |
| Evaluation evidence | W7 / `scripts/agent-eval` | suites, assertions and reports | product Skill, direct Agent runner, mock acceptance path |
| Deletion proof and release gate | W8 / integration owner | source scans, artifact scans and release guard | per-workstream release claims or bypass flags |

The manifest does not authorize parallel work to overlap files. The integration owner sequences shared-barrel and lockfile edits and requires all affected workstreams to consume the same canonical result.
