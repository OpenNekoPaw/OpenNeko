# Dual Registration Poison

The Agent extension quality gate now derives one canonical registration graph from the actual DSH bridge,
Generation, Canvas and Cut plugin sources/profiles. The accepted graph contains:

- exactly one `dsh` runtime and no Pi runtime;
- exactly one `openneko.generation`, one `openneko.canvas` and one `openneko.cut` Tool;
- no MCP contribution in the current official profile slice;
- exactly the four official first-party bridge/Generation/Canvas/Cut plugin identities.

The validator rejects empty or wildcard identities, duplicate Tool identities, duplicate MCP contribution
identities, any DSH/Pi dual runtime and any extra/missing/duplicate official Plugin identity. It is a quality
gate over the production registration inputs, not a second runtime registry.

```text
node --test scripts/check-agent-extension-surface.test.mjs
PASS: 5 tests, including dual-runtime/duplicate-Tool/duplicate-MCP/wildcard-Plugin poison

node scripts/check-agent-extension-surface.mjs
PASS: 14 evidence paths, 0 findings
```
