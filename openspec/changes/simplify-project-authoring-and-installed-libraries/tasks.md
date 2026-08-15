## 1. Canonical contracts and storage

> SUCCESSOR: simplify-project-authoring-and-installed-libraries
>
> Successor disposition (2026-08-15): This task list is the executable successor for
> `refine-character-management-authoring-and-version-graph`,
> `refine-world-management-authoring-and-runtime`,
> `separate-companion-and-narrative-character-conversations`,
> `simplify-resource-entity-character-world-boundaries`, and
> `unify-domain-authoring-workspaces`. Unchecked predecessor work that depends on standalone
> authoring, installed/adapted/recovery data, publication plans, or old entry destinations is
> retired; only compatible canonical facts are carried forward.

- [ ] 1.1 Across delivery batches B-D, atomically replace Character, World, Project, Host and IPC producers/consumers with workspace-object, global-object, immutable domain-version and exact-reference contracts; each batch must update its complete owning path and tests without compatibility shapes or parallel success paths.

## 2. Global catalogs and synchronization

- [x] 2.1 Implement owner-neutral-equivalent Chara and World application/repository paths for global catalog reads, first synchronization, later immutable versions, explicit stale-base choices and fail-local atomic commits; keep facts in their owning packages and test exact identity/history behavior.

## 3. Project Creative Workspace

- [x] 3.1 Delivery batch B: update `@neko/project`, Project Workspace, owner workspace ports, Project Node storage and minimal Desktop wiring to list local Content/Character/World objects plus exact read-only global references; atomically create Project-bound local objects, add/update/remove exact references, copy a global version to a fresh local object and synchronize local Character/World objects. Preserve the completed Assistant-bound Creator path and do not modify Agent Entry, the primary sidebar or unrelated management layouts.

## 4. Portable ZIP

- [x] 4.1 Delivery batch C: atomically replace Character/World install/import/adapt package producers, consumers, handlers and fixtures with one global import and one selected-version export per owner; enforce Host sender/path grants, bounded archive/inventory/integrity validation, temporary staging and atomic commit, and prove failure cannot mutate sibling global objects or Projects.

## 5. Entry and runtime

- [x] 5.1 Finish the existing-sidebar Agent Entry and interaction composition: Conversation/Creation only, Project selection retained in the Composer context bar, global Character multi-select plus World single-select, exact Dialogue/Room/World launch, and current-owner Agent/presentation/manager visibility without retained or cross-session Roots.

## 6. Destructive legacy removal

- [x] 6.1 Delivery batch D: delete the remaining installed-library/adaptation/recovery/publication-plan services, repositories, Roots, handlers, exports, fixtures, stores and resource directories after batches B-C remove their consumers; add exact-scope tests proving obsolete data is not read or migrated and canonical Project objects, domain versions, Conversations, Rooms, Runs, Saves and valid refs are not deleted.

## 7. Documentation and verification

- [ ] 7.1 Delivery batch D: update canonical Chinese/English Project, Character, World, Agent, Desktop composition and package-boundary docs; run focused package tests, archive-security tests, `pnpm typecheck`, `pnpm lint`, architecture/OpenSpec checks, Neko quality review, visible Electron UI validation and applicable real Agent evaluation, recording unrelated blockers and residual risks.
