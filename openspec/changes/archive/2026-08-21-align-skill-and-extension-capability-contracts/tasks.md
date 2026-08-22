## 1. Stable architecture contract

- [x] 1.1 Rewrite the Accepted Skill creator and validation ADR around the standard `SKILL.md` core and remove the retired Neko overlay and availability resolver.
- [x] 1.2 Update adjacent architecture guidance and navigation so capability metadata stays in runtime catalogs and plugin/marketplace responsibilities remain narrow.

## 2. Machine-readable capability surface

- [x] 2.1 Add `quality/agent-extension-surface.json` with evidence-backed Skill, composition package, marketplace, MCP, and Host capability classifications.
- [x] 2.2 Add a fail-visible static checker for evidence paths, forbidden private Skill overlay claims, and Skill/plugin/marketplace/MCP independence.
- [x] 2.3 Compose the checker into the existing Agent boundary quality command without creating a production dependency.

## 3. Verification and review

- [x] 3.1 Run the extension surface checker, Agent boundary gate, OpenSpec validation, and focused builtin Skill tests.
- [x] 3.2 Record the Agent Evaluation exclusion rationale, complete the Neko quality review, and report residual standards-compatibility risk.
