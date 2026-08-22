# Legacy Data Hash Baseline Blocker

Tasks 0.7, 8.4–8.6 and 11.14 remain open. The repository contains a synthetic pre-operation manifest,
but the current startup composition still calls `removeRetiredPiStorage`, which deletes four retired tables
and two retired directories before DSH initialization. That behavior conflicts with the byte-preservation
requirements and cannot be accepted as migration success.

No user directory was inspected. A compliant follow-up must remove the destructive startup service and file
port, then use repository-owned synthetic protected fixtures and the independently reviewable pre-operation
manifest to run the complete startup/list/open/clear/compact/failure matrix read-only and compare every byte.
It cannot decode retired transcript content, import it into DSH, write migration markers or repair rows.

Until that evidence exists, the final release guard must remain closed.
