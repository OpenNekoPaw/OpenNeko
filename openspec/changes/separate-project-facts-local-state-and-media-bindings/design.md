## System boundary

Project facts, machine-local state, rebuildable projections, and Media Library connections have different authorities and lifecycles. Project owns synchronized creative facts; local-state services own device-specific bindings and presentation; projections remain discardable; Media Library owns external directory relationships.

## Core invariants

- Deleting or corrupting local metadata cannot delete or fabricate Project content.
- Machine-local paths and grants never become synchronized Project facts.
- Rebuildable projection loss enters the same canonical computation and cannot change business meaning.
- Each invalid record fails locally while valid sibling Projects, bindings, and resources remain usable.
- No dual-read, migration fallback, active-Project inference, or hidden repair path is introduced.

## System acceptance

The change is complete when fresh, reopened, moved, disconnected, and locally reset Projects preserve exact facts and display explicit local binding state across supported validation environments.

## Non-goals

This change does not add cloud synchronization, remote path portability, or a universal local-state database.
