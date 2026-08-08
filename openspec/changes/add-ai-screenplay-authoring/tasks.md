## 1. Canonical Content File Path

- [x] 1.1 Define the exact content-source/protected-project classification at the Agent core file boundary, with explicit `.nkc` and `.otio` ownership and no wildcard/default classification.
- [x] 1.2 Make native content reads return the stable Workspace-relative target plus the freshness evidence required for conflict-safe replacement.
- [x] 1.3 Make native content create/replace atomic and conflict-visible without adding a format-specific writer, editor session or parser-gated publication path.
- [ ] 1.4 Add producer/consumer tests proving Markdown, Fountain and ordinary text use the same core file path and trigger downstream file-change projections.

## 2. Retire The Specialized Screenplay Path

- [x] 2.1 Remove `InspectScreenplay`, `CreateScreenplayDraft` and `ReplaceScreenplayScene` names, provider implementation, prompt fragment, registration, exports and fixtures atomically.
- [x] 2.2 Restore `TextDocumentIdentity` to the Window editor owner only and remove Agent Conversation session construction plus the screenplay-specific document creation service.
- [x] 2.3 Update Text Editor tests and documentation so Agent writes are external Workspace changes: clean sessions reload, dirty sessions preserve their buffer and report conflict.
- [x] 2.4 Add poison tests proving no screenplay Tool, Agent-owned Text Document session, parser-gated writer or compatibility registration can participate in successful content authoring.

## 3. Protect Structured Project Documents

- [x] 3.1 Reject generic Agent content reads and writes for Canvas `.nkc` and Cut `.otio` while retaining safe catalog metadata needed to select an exact target.
- [ ] 3.2 Prove Canvas Agent reads/writes use exact Canvas query/authoring capabilities and expected project revision without an active Renderer.
- [ ] 3.3 Prove Cut Agent reads/writes use exact Cut query/authoring capabilities and expected OTIO revision without an active Renderer.
- [ ] 3.4 Add no-fallback tests for missing operations, invalid arguments, stale revisions and codec failures; generic file Tools and shell redirection must not report success for the protected target.

## 4. Evaluation

- [x] 4.1 Update the indexed `agent-runtime/screenplay-authoring` suite and coverage mapping from specialized screenplay Tools to native Fountain file authoring.
- [x] 4.2 Add one positive case proving durable `.fountain` creation/update through the core file path and absence of the retired Tools/session owner.
- [ ] 4.3 Add one boundary case proving protected `.nkc`/`.otio` raw access is rejected and structured capability failure has no generic file fallback. Raw access denial is authored; owning-capability failure evidence remains pending tasks 3.2-3.4.
- [ ] 4.4 Run key-free suite/schema/runner validation, then attempt real-provider complete-session and visible Desktop cases with explicit provider/model/cost authorization; record exact blockers. Key-free validation passes 285 tests and 23 suites/54 cases; real runs remain pending.

## 5. Documentation And Completion

- [x] 5.1 Update OpenSpec proposal, design, requirements, tasks and Evaluation disposition for the two-path authoring boundary.
- [x] 5.2 Add the stable architecture ADR and update Agent, headless authoring, Markdown delivery and Text Editor documentation.
- [ ] 5.3 Run focused Agent/Text Editor/Canvas/Cut tests and typechecks plus application, content-access, internal-versioning, dependency and OpenSpec gates after implementation.
- [ ] 5.4 Run the Neko quality review and record removed-path evidence, real Evaluation results and remaining user-data/concurrency risk.

## Baseline Evidence To Replace

- The current repository implements three screenplay-specific Tools, an Agent Conversation-owned Text
  Document session and an indexed specialized screenplay suite. Earlier key-free validation proves
  that replaced path only; it is not acceptance evidence for native content authoring.
- Real-provider batch and visible Agent behavior remain unverified pending explicit provider, model
  and cost authorization.
