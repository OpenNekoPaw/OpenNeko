## Agent Evaluation disposition

- Disposition: `update` the existing `agent-runtime.launch-binding` suite.
- Deterministic coverage for task 7.6 proves exact Entry receipt materialization, one-Character Dialogue, multi-Character Room, request replay without a second runtime, owner-unavailable rejection before Conversation/provider/Scene commit, and absence of Assistant/Authoring fallback.
- Complete World Experience behavior remains blocked on the `WorldExperienceVersion` producer owned by `define-ai-native-interactive-world`. Key-free tests may assert the owner-qualified unavailable result, but must not treat `WorldVersion` or a mock runtime as World Experience evidence.
- Existing declarative suite cases and key-free harness validation cover the runtime-binding portion. The new visible Character selector remains blocked on driver support below, so task 9.6 stays open. Visible real Electron UI and hidden full-Desktop real-provider evidence remain task 9.7 and are not established by unit tests.

### Chara Entry catalog delta (2026-08-11)

- The affected evaluation surface remains `agent-runtime.launch-binding`; no Prompt, Skill, provider selection or tool protocol changed.
- Existing launch-binding/runtime tests prove exact Character receipt materialization, one-Character Dialogue, multi-Character Room, replay idempotence and owner-unavailable rejection. New deterministic producer/consumer evidence proves Chara-owned published-version discovery, compact projection, exact UI receipt configuration, storyline clearing for Room, stale receipt blocking and absence of Workspace roleplay search.
- The declarative Desktop driver currently has no operation for selecting a Character Dialogue mode, published CharacterVersion or optional storyline through the visible Entry. Adding a case now would require an unsupported Scenario field or a direct runtime shortcut, both forbidden by the evaluation boundary. Therefore no synthetic case was added and task 9.6 remains open for this UI delta.
- `pnpm test:agent:eval` passed the 307-test key-free harness and dry-ran all 25 suites / 74 cases, including `agent-runtime.launch-binding`; this establishes harness readiness only.
- Provider-backed visible Electron acceptance also remains unexecuted because this task has no explicit provider/model/cost authorization. Unit and key-free evidence are not reported as Agent behavior evidence.

### Agent Entry contextual Overlay delta (2026-08-11)

- This delta changes Entry presentation and target-catalog timing only. It does not change Prompt, Skill, provider/model selection, tool protocol, receipt shape, first-submit transaction or formal runtime routing, so the affected behavioral suite remains `agent-runtime.launch-binding` and no new evaluation Scenario field was invented.
- The Authoring root catalog now loads only while its current Overlay body is mounted. Project-local Character/World targets require an explicit project expansion, after which Desktop authorizes that exact project and loads its exact Project-owned navigation projection. A source boundary test proves root catalog load does not call project authorization/navigation; a focused selector test proves the project loader is not invoked before expansion.
- Character Dialogue continues to load only after that Entry mode is selected. Narrow/medium close and incompatible mode changes unmount the current owner body; responsive width projection changes only the frame presentation and does not own Draft target state.
- `pnpm test:agent:eval` again passed the 307-test key-free harness and dry-ran 25 suites / 74 cases. This remains harness and declarative coverage readiness, not real model or visible UI evidence.
- The declarative Desktop driver still cannot choose an Entry mode/target or resize the current Entry container without adding an unsupported operation. Direct contract/runtime shortcuts remain forbidden, so no synthetic Evaluation case was added.
