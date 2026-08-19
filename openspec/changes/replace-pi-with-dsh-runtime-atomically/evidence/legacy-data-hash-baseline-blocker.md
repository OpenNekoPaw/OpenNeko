# Legacy Data Hash Baseline Blocker

Tasks 0.7, 8.5 and 11.14 remain open. The repository contains no deletion-before manifest that binds
representative Pi JSONL, `pi_*` rows with unknown fields, retired databases and `.neko/` fixtures to exact
byte hashes. Current hashes could prove only the post-deletion state and must not be presented as before/after
evidence.

No user directory was inspected to compensate for this missing repository evidence. A compliant follow-up
must use repository-owned synthetic protected fixtures and an independently reviewable pre-operation manifest,
then run the complete startup/list/open/clear/compact/failure matrix read-only and compare every byte. It cannot
decode retired transcript content, import it into DSH, write migration markers, repair rows or use a current
post-deletion hash as a fabricated historical baseline.

Until that evidence exists, the final release guard must remain closed.
