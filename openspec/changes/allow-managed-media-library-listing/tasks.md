## 1. Read and write authorization

- [x] 1.1 Add a read-only Workspace path authorization function that preserves lexical Workspace checks while allowing a readable symlink target outside the Workspace realpath.
- [x] 1.2 Route the canonical Node workspace content reader through the read-only authorization function without changing writer or directory-creator defaults.
- [x] 1.3 Prove strict writer and directory-creator denial for linked files and linked parents remains unchanged.

## 2. Agent Core Tools

- [x] 2.1 Remove the ordinary `ListDirectory` pre-enumeration symlink rejection and preserve bounded canonical Workspace-relative projection.
- [x] 2.2 Extend read-only `Grep` to follow symlink files/directories with per-request realpath cycle protection and fail-local diagnostics.
- [x] 2.3 Update Core Tool descriptions and presentation text so read/list behavior no longer claims all symlink traversal is denied.

## 3. Deterministic coverage

- [x] 3.1 Add content reader tests for linked text reads, linked directory metadata, broken links, and unreadable targets.
- [x] 3.2 Update Core Tool tests for successful linked `Read` and `ListDirectory`, linked `Grep`, no physical-target leakage, and sibling isolation.
- [x] 3.3 Update existing symlink write tests and add linked-parent directory-creation denial coverage.

## 4. Agent Evaluation and product verification

- [x] 4.1 Update the mapped Agent Evaluation case with read/list positive evidence, write denial, no-target-leak evidence, and an explicit forbidden fallback.
- [x] 4.2 Validate the focused Evaluation case key-free and record any real-provider/Desktop infrastructure blocker without substituting a direct runtime path. Key-free dry-run passed; provider-backed execution is `infrastructure-blocked` because explicit provider, model, and cost authorization is unavailable.
- [ ] 4.3 Verify the visible Electron Workspace conversation path with Computer Use: list the linked directory, read a linked text file, and prove the write path is denied.

## 5. Quality and handoff

- [ ] 5.1 Run focused content/runtime tests, typecheck, OpenSpec validation, and `git diff --check` on the touched files.
- [ ] 5.2 Run the Neko quality review and record the canonical path, changed files, verification results, and residual risks.
- [ ] 5.3 Submit only the files belonging to this change and commit the related changes with a clear message.
