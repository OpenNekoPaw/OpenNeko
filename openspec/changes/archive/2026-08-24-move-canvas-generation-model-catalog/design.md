## Boundary

`@neko/canvas-domain` owns the purpose-qualified model option projection because it decides Canvas
generation semantics. It receives only enabled provider/model display facts, exact default refs,
and an injected purpose-support predicate. It does not import Host configuration types.

Desktop retains configuration lookup and adapts `ConfigManager` plus `modelSupportsPurpose` to the
Canvas input. The replaced `desktop-canvas-generation-model-catalog.ts` path is deleted.

| Item | Owner / role | Canonical path | Runtime boundary |
| --- | --- | --- | --- |
| purpose/default/sort projection | Canvas domain | `@neko/canvas-domain` | host-neutral |
| configured model/provider reads | Host settings adapter | `@neko/host/settings` | Desktop Main composition |
| Canvas consumer | Desktop adapter | Canvas public function | Electron Main |

No persistent data, contract generation, fallback, or compatibility path is introduced.
