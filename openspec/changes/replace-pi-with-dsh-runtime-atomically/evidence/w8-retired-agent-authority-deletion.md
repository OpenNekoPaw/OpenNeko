# W8 Retired Agent Authority Deletion

## Deleted Authorities

- Pi Agent/Session/provider/credential/Skill/projector implementation and public subpaths.
- OpenNeko MCP client, manager, bootstrap, Tool wrappers and runtime contracts.
- OpenNeko Plugin runtime, extension manager and automation capability adapter.
- OpenNeko Skill Host and capability Tool bridge.
- Desktop direct Agent launch/automation contracts and alternate DSH SDK/embedded runtime paths.

`packages/agent/contracts/src/mcp.ts` was the final public residue of the custom MCP runtime. It had no consumer and exported `IMCPClient`/`IMCPManager` runtime authority, so it and its root barrel export were deleted. The later W8 Host config audit also proved `MCPServerConfig` had no DSH management consumer; it, Host `mcp_servers` CRUD/TOML projection and the parallel external-research contract were deleted rather than retained as configuration-only aliases.

## Canonical DSH Boundary

Desktop launches one bundled Node/DSH subprocess and communicates only through package-owned ACP. Desktop and Host production code cannot import Cordis, the DSH TypeScript/Python SDK, Remote API clients, Electron RunAsNode or `ctx.agents`.

The separately packaged official DSH bridge plugin is executed inside the DSH subprocess and legitimately uses public Cordis and `ctx.agents` to implement the canonical DSH-owned Agent/Session path. This does not create an embedded Desktop runtime or fallback.

## Poison Evidence

`check:agent-boundaries` rejects:

- restoration of any file under retired Pi, MCP or Plugin/extension runtime directories;
- restoration of the retired MCP contract or Skill/Plugin runtime files;
- retired root exports;
- Pi, DSH SDK, embedded Cordis, RunAsNode, `process.execPath`, `ctx.agents` or direct Agent bridges in Desktop production code/manifests.

The directory poison has an isolated fixture proving an empty retired directory is harmless while a restored Pi file or MCP contract fails. `check:agent-extension-surface` independently scans canonical bridge/profile/tool registration and rejects duplicate runtime, Tool, MCP or wildcard Plugin registration.

## Verification

```text
pnpm --dir packages/agent/contracts run typecheck
PASS

pnpm --dir packages/agent/contracts run test
PASS: 40 files / 210 tests

pnpm check:agent-boundaries
PASS: 12 gate tests; 360 production/Evaluation files; 14 extension evidence inputs

source scan: IMCPManager, IMCPClient, MCPServerConfig, ./mcp export, agent-contracts/mcp
PASS: no matches
```

Tasks 11.2, 11.4 and 11.5 are complete for production source, public exports, manifests and registration. Production Evaluation definitions are now included in the same retired-marker gate. W8 remains open because the current generated Desktop bundles and packaged `app.asar` predate the cutover and fail `check:agent-retired-output`; they cannot be regenerated before the release guard under task 12.6.
