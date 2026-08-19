# Release Isolation Negative Paths

## Guarded Product Entries

`apps/neko-desktop/package.json` executes the unconditional integration-only cutover guard before the
host check, DSH runtime staging and Electron Forge for `build`, `package` and `make`. The guard has no
environment bypass and exits before a Desktop artifact can be created.

GitHub Actions contains only `ci.yml`; it has no Desktop packaging job, tag trigger, Forge invocation,
release creation or Q0 fixture publication path. Host-neutral build/typecheck/unit validation remains
available while native Desktop release production is blocked.

## Q0 Isolation

`scripts/dsh-q0` is a standalone qualification fixture. It is absent from:

- Electron Forge `extraResource`;
- `prepare-dsh-runtime-stage.mjs`;
- the verified DSH runtime closure descriptor/stager;
- GitHub workflow artifact or release inputs.

The production stage accepts only an explicit `NEKO_DSH_RUNTIME_ROOT` whose descriptor, regular-file tree,
checksums, licenses, Node executable, DSH CLI release and official profile bundle list pass the canonical
closure verifier. A Q0 profile or fixture output cannot satisfy that contract implicitly.

## Verification

```text
node --test \
  scripts/test-orchestration/dsh-cutover-release-guard.test.mjs \
  scripts/test-orchestration/desktop-build-platforms.test.mjs \
  scripts/test-orchestration/macos-release-workflow.test.mjs

PASS: 7 tests
```

Task 3.2 remains open: the final release guard does not yet validate every required Q0, consumer cutover,
data-preservation, W7 Evaluation and W8 deletion artifact because those inputs are not all complete. This
evidence proves only the negative isolation requirements; it does not make the branch release-ready.
