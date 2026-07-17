# Legacy Agent transcript discard and removal policy

Date: 2026-07-16
Applies to: the one-shot Pi replacement in TUI, VS Code Extension and Webview.

## Data decision

Prelaunch transcripts written by the OpenNeko `ConversationManager`, Journal reader/writer/projection, AgentSession persistence, history hydration or custom compaction formats have no retained user value for this migration. The Pi release does not import, translate, dual-read, dual-write, rebuild or recover those transcripts.

The new runtime creates only Pi Session JSONL under the program-owned user storage root. Workspace files never become a transcript recovery source. Existing legacy files may remain as ignored orphan bytes until an independently approved cleanup policy removes them; normal startup must not scan or parse them, and this migration must not silently delete unrelated user files.

## Runtime behavior

- There is no legacy runtime flag, importer, reader, compatibility session, fallback hydrator or old command alias.
- A Pi conversation without its user-global Conversation/Branch metadata fails visibly; it is not reconstructed from workspace files or orphan transcript JSONL.
- Unsupported Pi Session schema/version and missing branch mappings fail visibly.
- Source rollback is the only rollback. A running build cannot select the old executor, journal, Skill lifecycle or Platform chat path.
- Diagnostic logs and SQLite listing projections are not transcript authorities.

## Removal check contract

The migration is not complete until executable repository checks prove all of the following:

1. Production exports and Host imports contain none of `AgentExecutor`, `ConversationManager`, `JournalReader`, `JournalWriter`, legacy history hydration, AgentSession persistence, Platform `IService`/chat adapters or legacy Skill activation entrypoints.
2. The old executor, journal/history/custom-compaction and Skill lifecycle source directories/files are absent from the production package.
3. TUI and VS Code composition roots import the Pi conversation runtime and cannot construct the old session/runner/service path.
4. Pi Session create/append/close/reopen/branch/context tests pass while the legacy entrypoints are poisoned to throw.
5. Repository configuration contains no legacy transcript importer, migration command, feature flag, dual-read/dual-write or fallback alias.
6. Agent Evaluation facts identify the Pi runtime and Pi Session authority and reject any forbidden legacy-path participation.

The transcript-reader/importer subset is enforced by `scripts/check-neko-agent-boundaries.mjs` across the Agent, Extension and TUI production trees. The guard rejects both retired source-file resurrection and production references to the removed authorities; it has no compatibility allowlist. The broader kernel/Skill/Platform checks remain red until their owning removal tasks complete.
