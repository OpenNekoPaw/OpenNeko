## 1. Contract

- [x] 1.1 Freeze `${HOME}/Git/neko-test` as the sole runtime acceptance
      workspace and define the non-workspace temporary-data exclusion.
- [x] 1.2 Define marker-owned fixture replacement and outside-root rejection.

## 2. Implementation

- [x] 2.1 Move generated media fixtures to
      `.neko/.functional/media-runtime` under the canonical workspace without
      deleting the workspace root.
- [x] 2.2 Update VS Code launch configuration contracts and the debugger Skill.
- [x] 2.3 Default and constrain media matrix validation to the canonical root.
- [x] 2.4 Remove contradictory active architecture/OpenSpec requirements.

## 3. Validation

- [x] 3.1 Run fixture/path contract tests and strict OpenSpec validation.
- [x] 3.2 Generate the fixture in `${HOME}/Git/neko-test`, verify its marker
      and media, and prove no repository-local test workspace is used.
- [x] 3.3 Run affected build/test/check gates and record remaining risks.
