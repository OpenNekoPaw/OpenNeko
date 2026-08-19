## Scope

Inventory captured before the breaking contract replacement. Searches covered production, tests,
fixtures and Evaluation artifacts under `packages/`, `apps/` and `scripts/`.

## Contract surface

| Surface | Production owners | Role | Replacement |
| --- | --- | --- | --- |
| `ContentLocator` | Content, Agent, Canvas, Generation, Assets, Entity, Preview, Project, Search, Quality, Text Editor, Chara, Cut and Desktop | Durable content address, IO input/result and cross-package reference | `ContentFileLocator` plus optional `ContentSelector` |
| locator fingerprint/digest | Content read service, generated output and package consumers | Freshness/CAS and owner evidence embedded in address identity | `expectedFingerprint` IO option/result or owner-held receipt/provenance |
| `generated-output` branch | Generation commit/lifecycle/Job, Agent delivery, Canvas projection and Desktop | Generation owner identity plus Workspace path | Workspace file address; Generation keeps output identity, digest, Job and lineage |
| `document-entry` branch | Document reading, Agent visual input, Canvas material and Desktop | Archive member nested below a Workspace file | Workspace file address plus entry selector |
| `package-resource` branch | Project/package/entity/assets readers and Desktop | Package authority, member, digest and manifest metadata | Exact package file authority/member path; digest and manifest metadata remain package-owned |
| `ContentRepresentationLocator` | Content representation contract, Agent visual paths, Preview, Media, Search and Quality | Runtime representation identity plus source/spec/generator/cache freshness | Deleted; runtime-owned opaque `ContentRepresentationHandle` |

The inventory found `ContentLocator` references across 16 package/application owners. The largest
consumer groups are Agent, Canvas, Assets, Content, Desktop and Generation. The public
`ContentRepresentationLocator` occurs in Content, Agent, Preview, Media, Search and Quality. This is
a shared-contract replacement, not a package-local rename.

## Persistence and user-data impact

| Persisted owner | Stored shape | Authority | Invalid old-shape behavior required |
| --- | --- | --- | --- |
| Canvas `.nkc` | Material/job/artifact `contentLocator` | User-authored project fact | Preserve the node bytes and surface a node-local invalid locator diagnostic; valid sibling nodes and Workspaces remain usable. Existing layered validation already supports unavailable material-locator warnings and must be extended with replaced-shape tests. |
| Generation Job SQLite rows | `resultLocators` inside `snapshot_json` | Durable Generation Job history | Preserve the row unchanged. Exact access returns `generation-job-persistence-invalid`; recovery listing already isolates invalid rows and returns sibling snapshots plus diagnostics. No compatibility decode or inferred locator is allowed. |
| Generated output projection ledger | lifecycle `contentLocator` beside Generation-owned asset identity/digest/path | Rebuildable projection over durable generated files and domain history | Reject and report the projection entry while preserving the stored entry under the existing preserve-and-report policy; rebuild only from current Generation authority. |
| Agent conversation lifecycle | initial-input context references containing `contentLocator` | Conversation metadata, not transcript authority | Preserve the Conversation record; opening the affected Conversation fails locally with its persistence diagnostic. Conversation catalog and sibling Conversations remain available. No locator field is dropped or rewritten silently. |
| Pi transcript/tool/display data | Tool results and display/reference projections | Transcript/runtime evidence, not content authority | New serialization must not contain representation handles or old locator shapes. Existing invalid records remain rejected in their owning Conversation rather than becoming durable artifacts. |
| Entity/Project/Character facts | representation bindings and content references | Owning-domain user facts | Preserve the owning record and mark the exact binding/reference invalid; do not rewrite identity, infer an active Workspace or remove sibling facts. |
| Search/local metadata/resource-cache records | locator-keyed search/display/cache projections | Rebuildable projection | Reject the invalid entry locally and rebuild from current authority; it is not a migration source or fallback. |

The old contract appears in published tags, so old persisted records are possible. Automated shape
conversion is neither necessary nor permitted: every authoritative owner can preserve the original
record and fail locally, while rebuildable projections can be discarded and recomputed from current
authority. Implementation is therefore not blocked by a separate migration change, provided the
replacement adds path-level tests for the isolation behavior above and does not add a legacy parser,
dual read/write or fallback conversion.

## Agent Evaluation disposition

- `document-image-native-delivery`: update the existing `agent-runtime.stream-delivery` case to prove
  opaque references, provider visual bytes and absence of representation persistence.
- `workspace-board-projection`: update the existing Workspace Board coverage owned by
  `agent-runtime.creative-media-workflow` / `agent-runtime.workflow-controller` to prove durable
  canonical locators and rejection of representation-only artifacts.
- Real provider evidence remains required because Tool routing and artifact delivery can change;
  key-free validation alone is not behavioral acceptance.
