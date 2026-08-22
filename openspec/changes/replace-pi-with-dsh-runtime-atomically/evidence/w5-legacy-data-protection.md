# W5 Legacy Data Protection

## Unavailable record contract

`@neko/agent-contracts` now owns `projectRetiredConversationUnavailable`. It accepts only bounded
Conversation identity, owner, title and timestamp metadata and emits an Agent Home entry with
`conversation-runtime-unavailable`, `attention: none`, and no DSH Session identity. It never accepts
or decodes Pi transcript content and does not create a replacement Session.

## Protected synthetic fixtures

`scripts/fixtures/legacy-data-protection/` contains repository-owned representatives for Pi JSONL,
`pi_*` rows with an unknown field, a retired database, and Workspace `.neko/` bytes. `manifest.json`
is the pre-operation SHA-256 manifest. `scripts/legacy-data-protection-fixture.mjs` verifies each
fixture byte-for-byte without reading a user directory or mutating any fixture.

The startup/list/open/clear/compact/failure matrix is represented by independent read-only tests.
Each operation runs the shared pre/post hash runner; any write, deletion, repair, import or byte
change fails. The runner is ready for product operation adapters but does not inspect user directories.

## Retired entry poison

`retired-pi-data-access-poison.test.ts` scans production Main, Agent runtime and contract sources for
retired catalog readers and mutation/import/repair entry points. Existing Desktop composition poison
remains in force. No retired data reader is part of the canonical DSH path. However, the current composition
still invokes `removeRetiredPiStorage`; that destructive service must be removed rather than allowlisted as a
special migration path.

## Remaining limitation

The protected fixture manifest exists, but current startup behavior deletes retired bytes instead of preserving
them. Tasks 0.7, 8.4–8.6 and 11.14 remain open until the destructive service is removed and the read-only
startup/list/open/clear/compact/failure matrix proves byte preservation. No Pi-only unavailable catalog or
legacy reader is required to satisfy that boundary.

## Evaluation disposition

`excluded`: this unit adds pure canonical parsing/projection, repository fixture hashing and source
poison only. It does not change DSH session execution, prompts, tools, permissions or provider routing.
The deterministic contract, pre/post byte hash and no-retired-entry tests are authoritative here; a real
provider run could not prove additional behavior. The foundational Agent session matrix is unaffected.
