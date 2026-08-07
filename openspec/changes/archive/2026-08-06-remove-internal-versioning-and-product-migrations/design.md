## Context

OpenNeko is a local Electron product whose Main, preload, Renderer, and package-owned runtimes are built and shipped together. Internal contract versions therefore do not negotiate independently deployed peers; they create a second validity condition that can drift across Vite prebundles, persisted component state, SQLite rows, and package updates. The repository also runs product-startup migrations for state, cache, project facts, jobs, and Agent data even though the product is prelaunch and the governing policy now requires stable additive data contracts, explicit offline repair, and fail-local behavior.

The affected responsibilities stay with their current owners. `apps/neko-desktop` remains the Electron trust and composition boundary; it must not absorb Host, Agent, Assets, Canvas, Entity, or persistence policy while version fields are removed.

## Goals / Non-Goals

**Goals:**

- Make every OpenNeko-owned contract shape and persisted component shape canonical and version-free while retaining immutable domain versions that users explicitly manage.
- Remove all product-reachable migration, legacy compatibility, automatic repair, and version dispatch paths.
- Keep third-party service, library, interface, model, format, and tool versions where their external boundary requires or publicly exposes them.
- Preserve exact instance ownership, ordering, cancellation, concurrency safety, and sender authorization without unnecessary data-generation versions; retain a correctness token only with a verified consumer and invariant.
- Contain malformed input to the smallest record, operation, component, instance, sender, or workspace that can be identified.
- Add a quality gate that prevents reintroduction.

**Non-Goals:**

- Removing third-party API versions, model identifiers, MCP fields, glTF/GLSL fields, dependency pins, Electron release metadata, or toolchain versions.
- Removing immutable domain version identity that users publish, select, pin, compare, restore, or roll back, including Character and managed Asset versions.
- Silently deleting, rewriting, or importing existing user data.
- Introducing a generic compatibility framework, schema registry, remote synchronization protocol, or multi-host negotiation layer.
- Moving package-owned behavior into Desktop Main.

## Decisions

### 1. One canonical internal shape with no negotiation field

All producers and consumers in a changed boundary switch atomically to one package-owned shape. Decoders validate required semantic fields and identities but do not read a version discriminator, dispatch by shape generation, or fill removed legacy fields. The replaced constants, parser branches, fixtures, and error codes are deleted.

Alternative considered: retain one current version without compatibility branches. Rejected because the field still invalidates data and permits future version dispatch.

### 2. Retained versions require exact evidence-backed registries

The repository gate permits an external occurrence only when an external service, library, interface, model, format, or tool requires or publicly exposes it and an exact allowance records owner, external system, reason, and normative source. It permits a first-party domain occurrence only when an exact allowance records the semantic owner, concrete user workflow, business requirement, scope, and isolation. It permits another internal correctness occurrence only when an exact allowance records the owner, concrete consumer, correctness invariant, why a version-free design is not viable, and removal condition. No allowance permits internal contract/schema dispatch, component state versions, migration code, automatic repair, or package-wide exclusions.

Alternative considered: directory-wide exclusions for providers, versioned domains, and build folders. Rejected because an internal contract or component version could then hide beside a legitimate retained field.

### 3. Ordering and ownership do not default to versions

Runtime ordering uses a monotonic `sequence` only when it represents event order within one live owner and is not persisted, used as a data-generation discriminator, or included in a component key. Cancellation uses request identity and an owner-held current request set. Renderer replacement uses a new instance identity rather than an epoch counter. Local mutation should be serialized by the owning service; a CAS token may remain only when a verified concurrent consumer and invariant show serialization or a boundary-local fingerprint cannot preserve correctness.

Alternative considered: rename every `revision`, `epoch`, or `generation` field. Rejected because aliases preserve the forbidden design and do not establish a real consumer or invariant.

### 4. Component presentation state uses stable semantic ownership

Agent drafts, Workbench layout, Shell window presentation, Assets facet state, Preview controls, and other recoverable UI data are keyed only by stable owning instance identity. Component state has no schema field and no migration reader. Invalid entries are skipped individually with a diagnostic; valid sibling entries remain available. A missing optional field uses its permanent documented default, not a generation-specific fallback.

### 5. Product data migration is deleted, not disabled

Product imports, startup composition, package public entries, runtime registries, and ordinary tests must not reference migrators, migration inventories, legacy sources, compatibility codecs, or automatic rebuild handlers. Existing bytes remain untouched. A current reader either accepts the stable canonical shape or reports a local diagnostic. Any repair utility is physically outside product imports and build reachability, requires an explicit target and confirmation, creates a backup, and is never invoked by CI or startup.

Historical lifecycle inventories are not part of canonical product or Evaluation data. Fields that catalogue replaced, legacy, or retired cases, contracts, modules, or shapes are deleted with their consumers; they are not renamed into a new lifecycle vocabulary. Current coverage indexes describe only current targets and current executable suites.

Replacement verification has a bounded lifetime. During development, an engineer may use temporary historical inputs, path spies, or one-off searches to prove that the replaced path no longer runs and that the canonical path succeeds. Before delivery, those inputs, tests, snapshots, identifiers, and dedicated diagnostics are deleted rather than promoted into the permanent suite. Durable tests know only the current canonical contract: they prove its successful route, reject generic invalid current input, and preserve unaffected siblings. A centralized repository gate may keep only minimal synthetic self-test samples needed to prove the gate itself; they remain unreachable from product and domain test graphs and do not catalogue real retired implementations.

### 6. Persistence keeps stable tables and additive fields

The Local Metadata owner removes the generic versioned migration registry from the product contract. Rebuildable projections are populated by ordinary source discovery into stable tables; invalid rows are quarantined logically by entry-local diagnostics and never cause the database or workspace to be globally unavailable. Authoritative state uses stable table contracts and additive nullable columns with permanent semantics. Changes that cannot be additive require an explicit offline repair decision before implementation.

A persisted authority root is a containment envelope, not a component-generation discriminator. Its required semantic collections and identities remain strict, while unknown top-level fields are retained as opaque metadata, reported by exact field name, and serialized back unchanged. The reader must not branch on a field name, infer a data generation, expose the field as business state, or rewrite it. Owned child records remain independently strict so an invalid Project, Window, component, or instance is rejected at that exact boundary. A non-object root or a missing or invalid required root collection still rejects the authority because no smaller owner can be identified.

Stable-table writes update an existing authority row directly and insert only when the authority identity is absent. An update changes only canonical owned columns and leaves unknown table columns untouched; it must not synthesize values for, inspect, or dispatch on those columns. This is the single write path for both newly initialized and existing stable tables, not a schema compatibility branch.

### 7. One canonical success path includes adapters and projections

Each owning boundary has one canonical contract, authoritative source, application service, exact handler registration, boundary adapter, and derived projection path. Explicit parallel paths such as version dispatch, dual-read/write, feature-flagged old implementations, handler probing, provider/source fallback, and automatic repair are removed. Hidden alternate success paths such as broad-catch empty results, implicit sessions, active-instance fallback, wildcard/default handlers, and cache/raw/projection source switching are rejected as the same architectural defect.

Adapters only translate, authorize, and invoke at a real external, OS, Electron, or trust boundary. Provider-specific versions remain inside the exact adapter, but adapter failure does not switch provider, source, contract, or internal implementation. Projections are rebuildable read models derived from authoritative data, never a second authority; a source fingerprint expresses freshness only. Reprojection from the current authority is ordinary canonical computation, while fallback to stale projection, raw path, cache path, legacy source, or an empty success result is forbidden. Cache remains semantically transparent, and registries resolve one exact handler per identity without first-compatible or try-next behavior.

Automated checks block explicit version, migration, compatibility, dual-path, automatic-repair, implicit-owner, and alternate-handler markers in both production and test source. Exceptions are exact occurrences backed by a real external contract or user-managed domain meaning; directory names, filenames, and broad vocabulary are not allowances. Semantic properties that cannot be proven statically are covered by durable path-level producer/consumer tests that positively assert the unique owner, handler, adapter, authority, and projection plus an unaffected sibling path on generic local failure. They do not retain historical fixtures or assertions about a named retired implementation.

### 8. Owner and boundary matrix

| Owner                   | Package role and canonical path                                                         | Producer / consumer                                                  | Replaced path                                                                                          | User-data impact                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Host                    | `@neko/host` L0/L1 public Shell, Scene, Workbench, settings, grant contracts            | Host services / Desktop Main and Renderer                            | Contract versions, Shell v1-v7, Workbench v1-v4 migration                                              | Existing valid fields remain readable; invalid window/component is local                 |
| Agent                   | `@neko/agent-contracts`, `@neko/agent-runtime`, `@neko/agent-webview`                   | Agent runtime / Desktop and Agent Webview                            | Protocol versions, Tab state schema, context and lifecycle migration                                   | Draft or conversation failure is isolated; no automatic conversion                       |
| Assets                  | `@neko/assets-domain`, `@neko/assets-node`, `@neko/assets-webview`                      | Resource controllers / Desktop and Resource Browser                  | Resource Browser v12, Asset Center versions, projection migrations; managed Asset revisions remain     | One entry or facet may fail without disabling siblings                                   |
| Chara                   | `@neko/chara`                                                                           | Character authoring/runtime / future package consumers               | File schema, memory/transcript and transport versions; user-managed immutable CharacterVersion remains | One invalid Character version fails by exact identity without disabling other characters |
| Other versioned domains | Owning package public contract and application service                                  | Domain producer / authorized UI and consumers                        | Technical schema/migration versions; explicit user-managed versions remain                             | One invalid business version fails by exact identity without disabling sibling objects   |
| Local metadata          | `@neko/local-metadata` L1                                                               | Owning package repositories / Node runtimes                          | `schema_migrations`, namespace migrations, versioned JSON state                                        | Database remains untouched on invalid rows; no startup migration                         |
| Creative domains        | Canvas, Cut, Preview, Entity, Generation, Chara, Search, Content, Media, Quality owners | Package application services / package Webviews and Desktop adapters | File/DTO versions, migrators, snapshot versions, versioned protocols                                   | Current stable fields remain; incompatible records fail locally                          |
| Desktop                 | `apps/neko-desktop` Application boundary                                                | Electron Main/preload / package public ports                         | Versioned bridge payloads, versioned filenames, migration startup wiring                               | No app-wide failure from one component or package record                                 |

Production logic retained in `apps/neko-desktop` is limited to Electron object lifecycle, sender binding, filesystem authorization, external release metadata, and concrete adapter wiring. None of the removed migration or validation policy remains app-owned.

## Risks / Trade-offs

- [Large cross-package blast radius] -> Apply owner-by-owner slices with producer, consumer, and real runtime verification while the new gate blocks new debt.
- [Existing non-canonical user data cannot open] -> Preserve bytes, report the exact record/path, keep unrelated data usable, and provide only explicit offline repair when authorized.
- [Removing revision fields can weaken concurrency] -> Identify the real consumer and invariant first; replace redundant fields with owner serialization, request identity, or content comparison, and retain only proven unavoidable tokens.
- [Retained versions expand into contract machinery] -> Require symbol-level external/domain/correctness allowances and tests proving retained versions do not become schema dispatch.
- [Parallel active OpenSpec changes still require versioning] -> Update conflicting artifacts before marking their affected tasks complete; the new change is authoritative for this cross-cutting rule.

## Replacement Plan (No Product Data Migration)

1. Add the repository gate and exact external, user-managed domain, and verified correctness allowance registries; it initially reports all unclassified internal violations.
2. Remove component presentation versions and product migrations that can block Desktop startup or whole surfaces.
3. Remove Desktop/Host and package-owned wire contract versions with atomic producer/consumer updates.
4. Remove package persistence versions and product migration modules owner by owner.
5. Redesign remaining internal revision/epoch/generation mechanisms and versioned identifiers.
6. Update stable architecture docs and active OpenSpec artifacts, then run full quality, Electron, media, and Agent validation.

Rollback is source rollback only. No rollback path may restore product migration readers or rewrite user data. Approved external, domain, and correctness allowances remain unchanged.

## Open Questions

- Which authoritative persisted records currently require a user-facing offline repair tool rather than local rejection only?
- Which live ordering counters can be replaced by existing request identities, and which require a narrow non-persisted sequence contract?
