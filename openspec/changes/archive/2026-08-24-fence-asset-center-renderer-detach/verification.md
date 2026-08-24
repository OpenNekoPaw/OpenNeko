# Verification: Fence Asset Center Renderer Detach

Date: 2026-08-24

## Risk classification

L2. The change updates the package-owned Asset Center Host contract and its Renderer → preload → Electron Main consumers. It does not change durable user data, Assets authority, or presentation layout.

## Canonical path review

- `@neko/assets-domain` owns one canonical request/result shape.
- Desktop Renderer supplies the current Shell-projected `rendererSessionId` on every request.
- Desktop Main checks the sender-bound Window and authoritative Renderer identity before Assets Node delegation.
- Assets Node remains the sole Asset Center session and resource owner.
- No version dispatch, compatibility request, fallback provider, duplicate handler, attachment registry, or second fact source was introduced.

## Automated verification

- Assets Domain: 18 files, 149 tests passed.
- Assets Node lifecycle: 1 file, 10 tests passed.
- Desktop focused suites: 5 files, 113 tests passed, covering Main fencing, Renderer propagation, preload parsing, Shell composition, and application integration.
- Assets Domain, Assets Node, and Desktop TypeScript checks passed.
- `pnpm check:application-boundaries` passed with 1,368 files and no findings.
- `pnpm check:webview-boundaries` passed.
- `pnpm check:openspec` passed with 170 validated items.
- Scoped ESLint, Prettier, `git diff --check`, and unfenced Asset Center request search passed.

The repository-wide internal-versioning audit remains blocked by unrelated pre-existing worktree changes: 89 new occurrences and stale allowances outside this change. The new `rendererSessionId` contract did not appear in its findings. Full-file ESLint for `app-host.ts` is likewise blocked by unrelated unused imports and an empty block already present in that dirty file; every other affected file passes scoped ESLint, and the edited Asset Center handler passes typecheck and focused tests.

## Visible Development runtime

With Asset Center active in the visible Development Electron app:

1. Reloaded the Renderer through Cmd+R.
2. Confirmed the replacement Renderer reconstructed the default Media Library and displayed the existing `Assets`, `Blame`, and `Media` directories.
3. Switched to Asset Library and waited for its empty catalog to finish loading.
4. Switched back to Media Library and confirmed the directory catalog remained usable.

This exercises the user-visible replacement path that previously emitted `Asset Center session ... is unavailable` and confirms the replacement session remains valid after outgoing cleanup.

## Residual risk

The current Codex task has no attached terminal stream, so the live Electron Main stderr could not be captured directly. This observation gap is covered at the exact boundary by the Main test: stale detach returns the typed `stale` result and the Assets Node spy is not called. A current-owner duplicate detach is separately asserted to remain fail-visible.

## Quality review

No task-scoped correctness, architecture, security, user-data, or lifecycle findings remain. The fix is intentionally local to the existing Renderer identity boundary and does not broaden cleanup idempotency.
