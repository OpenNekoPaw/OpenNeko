## 1. Establish The Cleanup Baseline

- [x] 1.1 Record the source revision, collection time, counting method, and current lifecycle counts
- [x] 1.2 Record the first-batch disposition and exclude changes with real unfinished work or dirty implementation overlap

## 2. Remove And Archive Verified Residue

- [x] 2.1 Verify and remove the seven artifact-free, untracked change directories
- [x] 2.2 Archive `synchronize-desktop-only-documentation` with its current documentation requirements synchronized
- [x] 2.3 Close and archive the bounded superseded changes whose remaining tasks are owned by verified successors
- [x] 2.4 Repair current Markdown references affected by archive moves (no path links targeted the moved directories)

## 3. Align Historical Documentation

- [x] 3.1 Mark the three replaced ADR/security documents Superseded while preserving their still-valid principles
- [x] 3.2 Refresh the dated OpenSpec governance snapshot and keep it non-authoritative

## 4. Validate The Cleanup

- [x] 4.1 Run strict OpenSpec validation and verify lifecycle counts
- [x] 4.2 Run Markdown formatting, local-link validation, legacy-debt or unused checks, and `git diff --check`
- [x] 4.3 Review the final diff and stage only this cleanup scope for commit
