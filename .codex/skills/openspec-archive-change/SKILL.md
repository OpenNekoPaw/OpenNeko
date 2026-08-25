---
name: openspec-archive-change
description: Handle an explicit request to archive a completed OpenSpec change only after checking repository policy. In OpenNeko, refuse retained proposal archives and guide the repository-required canonical cleanup instead.
license: MIT
---

# OpenSpec Archive Change

## Repository policy gate

Read the applicable repository instructions before listing, syncing, moving, deleting, or creating directories for a change.

If proposal archives are prohibited, stop immediately. Do not create `openspec/changes/archive`, do not move the change, and do not present archiving as the completion path. Explain the repository-required lifecycle: promote only stable system architecture or core domain conclusions into their canonical documentation, then remove the completed proposal when authorized.

Never delete an exact change unless the current request authorizes that deletion. Ask before removing user work when authorization is absent or ambiguous.

Only in a repository that explicitly allows retained archives may this workflow inspect completion, synchronize canonical specs as required, and move the exact selected change into the repository-defined archive location.
