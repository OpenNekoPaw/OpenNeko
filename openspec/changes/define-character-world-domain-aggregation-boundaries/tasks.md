## 1. Architecture artifacts

- [x] 1.1 Define why Character and World require separate top-level bounded-context owners
- [x] 1.2 Define aggregation roots, Agent reuse, CharacterVersion-to-World binding, Gameplay ownership, dependency direction, and fail-visible boundaries
- [x] 1.3 Add normative scenarios for package ownership, run identity, cross-domain binding, Agent reuse, and unavailable capabilities
- [x] 1.4 Define Host versus application-service orchestration, unique actor/session ownership, effective tool-policy intersection, revisioned WorldAction, memory promotion, and runtime-handle boundaries

## 2. Stable documentation

- [x] 2.1 Update the Desktop Project Profile ADR with `neko-chara` and `neko-world` top-level aggregation boundaries
- [x] 2.2 Update package boundaries without presenting the proposed packages as implemented capabilities
- [x] 2.3 Update architecture navigation to expose the expanded Character/World decision
- [x] 2.4 Synchronize implementation-ready decoupling constraints into the stable ADR and package boundaries

## 3. Verification

- [x] 3.1 Validate OpenSpec artifact structure and requirement/scenario consistency
- [x] 3.2 Run `git diff --check` and verify all changed Markdown links and paths
- [x] 3.3 Review the final diff for conflicts with existing Agent, Entity, Preview, Device/Live, Gameplay, and application composition boundaries
- [x] 3.4 Re-run strict OpenSpec validation and document checks after the decoupling contract update
