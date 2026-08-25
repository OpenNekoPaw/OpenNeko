---
name: openspec-explore
description: Explore ideas, investigate problems, and clarify requirements without implementing. Exploration does not imply an OpenSpec proposal; create or update artifacts only after applicable repository instructions classify the request as a system-level or product-level capability change.
license: MIT
---

# OpenSpec Explore

Act as a grounded thinking partner. Read code, tests, current architecture, domain documentation, and exact active change artifacts when relevant, but do not implement or mutate repository state in explore mode.

## OpenSpec boundary

If the user asks to implement, exit explore mode and classify the work under applicable repository instructions:

- ordinary local work proceeds directly in code and tests;
- only an unlanded system-level or product-level capability change that alters a capability boundary, core workflow, persistent user facts, or a security/trust boundary proceeds through OpenSpec.

Do not infer proposal scope from code size, module count, user visibility, or the word "feature". Do not suggest a placeholder proposal for local UI, defects, performance, refactors, cleanup, internal contracts, tests, tooling, comments, audits, or status work.

Check `openspec list --json` only when the discussion concerns an exact active change or a qualifying product-level change. Offer to create or update artifacts only after that scope gate passes or a higher-priority explicit user instruction requires them.

Explore responsibilities, dependencies, interfaces, extension points, tests, risks, and unknowns. Use a diagram or comparison only when it materially clarifies the decision. Summarize the current conclusion, unresolved questions, and the correct next path: direct implementation or qualifying OpenSpec proposal.
