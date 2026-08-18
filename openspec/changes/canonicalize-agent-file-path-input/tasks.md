## 1. Canonical resolver

- [x] 1.1 Define one `@neko/agent-runtime` path resolution result containing transient Host path and canonical Workspace-relative path; add normalization and exact-authority tests for POSIX and Windows forms.
- [x] 1.2 Replace relative-only `WorkspaceFileAccessPolicy` validation with the single resolver while preserving containment, managed-link, ignore and protected-document decisions.
- [x] 1.3 Add producer tests proving relative and absolute inputs for the same file produce the same canonical Workspace-relative identity and invoke one resolver/handler path.

## 2. Core Tool consumers

- [x] 2.1 Switch Read and Write to the canonical resolver and prove their results/locators never contain Host absolute paths.
- [x] 2.2 Switch Grep and ListDirectory to the canonical resolver and prove every match, entry and continuation directory is Workspace-relative.
- [x] 2.3 Update typed diagnostics so malformed and outside-authority inputs fail locally without raw Host errors, alternate roots or sibling failure.
- [x] 2.4 Add Pi/DSH adapter contract tests proving one OpenNeko Tool registration and identical path/result schemas; poison upstream or parallel file-Tool registration.

## 3. Evaluation and completion

- [x] 3.1 Update `agent-runtime.stream-delivery/directory-format-routing` with relative, authorized-absolute and outside-authority cases plus canonical-path and no-fallback assertions.
- [x] 3.2 Run focused Runtime tests with `pnpm --dir packages/agent/runtime test -- file-access-policy core-tools`, then `pnpm --dir packages/agent/runtime run typecheck` and `pnpm test:agent:eval`; record exact results and unexecuted real-provider lanes.
- [x] 3.3 Run `pnpm check:openspec`, `pnpm check:agent-boundaries` and `pnpm check:quality`; record unrelated dirty-worktree failures separately and list residual absolute-path leakage/runtime-adapter risks.
- [ ] 3.4 With explicit provider/model/cost authorization, run the focused complete-Desktop visible and headless Evaluation cases and retain submitted-path-form, canonical-result and no-fallback evidence; otherwise record `infrastructure-blocked` without claiming behavior acceptance.
