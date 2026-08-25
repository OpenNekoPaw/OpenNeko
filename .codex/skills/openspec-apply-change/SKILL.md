---
name: openspec-apply-change
description: Implement an existing active OpenSpec change after repository instructions confirm it is still an unlanded system-level or product-level capability change. Do not use to bootstrap ordinary local work or continue a proposal after its canonical capability path has landed.
license: MIT
---

# OpenSpec Apply Change

Implement one exact active change through the repository's canonical code and test paths.

## Scope and lifecycle gate

Before selecting or applying a change, read the applicable repository instructions and `openspec/config.yaml`. Continue only when the named change still represents an unlanded system-level or product-level capability boundary. A new feature label, user-visible difference, multiple files, or multiple modules is not sufficient.

Stop the OpenSpec workflow and report the mismatch when:

- the work is local UI, bug fixing, performance, refactoring, cleanup, internal contract, testing, quality, build, dependency, tooling, comment, inventory, audit, or status work;
- production code already provides the canonical capability path and only local repair or verification remains;
- the proposal contains implementation logs, file/class/function task lists, command evidence, or other material forbidden by repository governance.

Do not silently delete a change that may contain user work. Report whether repository policy requires removal and ask for direction when deletion is not already authorized by the current task.

## Workflow

1. Use a change explicitly named by the user or unambiguously identified by the current conversation. Do not select a change merely because it is the only active change. If no exact change is identified, list active changes and ask the user to choose.
2. Run `openspec status --change "<name>" --json` and `openspec instructions apply --change "<name>" --json`.
3. Read every returned context file, then repeat the scope and lifecycle gate against current production code.
4. Implement pending product milestones in order. Keep code changes focused, update the complete producer/consumer boundary atomically, and verify in proportion to risk.
5. Mark a task complete only after its product-level acceptance is satisfied. Pause on unclear requirements, design contradictions, errors, or blockers.
6. When all tasks are complete, report validation and follow the repository's proposal lifecycle policy. Never suggest or perform an archive when repository instructions prohibit proposal archives.

Report the exact change, completed milestones, validation commands, blocking conditions, and remaining risk.
