# W8 Retired Agent Authority Deletion

## Deleted Authorities

- Pi Agent/Session/provider/credential/Skill/projector implementation and public subpaths.
- OpenNeko MCP client, manager, bootstrap, Tool wrappers and runtime contracts.
- OpenNeko Plugin runtime, extension manager and automation capability adapter.
- OpenNeko Skill Host and capability Tool bridge.
- Desktop direct Agent launch/automation contracts and alternate DSH SDK/embedded runtime paths.

`packages/agent/contracts/src/mcp.ts` was the final public residue of the custom MCP runtime. It had no consumer and exported `IMCPClient`/`IMCPManager` runtime authority, so it and its root barrel export were deleted. The third-party `MCPServerConfig` remains in `config.ts`; this is provider-specific configuration managed through the DSH boundary, not an OpenNeko MCP runtime.

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
PASS: 41 files / 211 tests

pnpm check:agent-boundaries
PASS: 8 gate tests; 163 production files; 13 extension evidence inputs

source scan: IMCPManager, IMCPClient, ./mcp export, agent-contracts/mcp
PASS: no matches
```

Tasks 11.2, 11.4 and 11.5 are complete for production source, public exports, manifests and registration. W8 remains open because the Evaluation driver/cases still contain retired Pi execution facts and built-output/full repository scans remain incomplete under tasks 11.1, 11.3 and 11.6.
