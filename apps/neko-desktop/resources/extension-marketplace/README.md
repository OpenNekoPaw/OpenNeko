# OpenNeko Extension Marketplace

This directory is the first-party extension snapshot shipped by OpenNeko Desktop.
Only packages maintained in this public repository belong here.

Each catalog entry points to a contained package directory. A package uses
`.openneko-plugin/plugin.json` for display metadata and contribution locators,
portable `SKILL.md` directories for Pi Agent Skills, and optional contained MCP
configuration supported by the OpenNeko runtime.

The manifest keeps `interface.shortDescription` as its canonical default
introduction. Optional translations use exact lower-case locale keys under
`interface.localization`, for example:

```json
{
  "interface": {
    "shortDescription": "Reviewed browser observation",
    "localization": {
      "zh-cn": { "shortDescription": "经过审核的浏览器观察能力" }
    }
  }
}
```

Each localized record contains only `shortDescription`. Invalid locale keys or
localized records invalidate that plugin manifest without hiding valid sibling
plugins. Locales without an entry display the canonical default introduction.

Browser Use and Computer Use are listed from this first-party snapshot so
their reviewed scope and current qualification state are visible. Their entries
remain `unavailable` until OpenNeko publishes the exact self-contained platform
artifacts and records packaged qualification evidence; listing never permits a
download or install by itself. Release builds rely on this snapshot only through
the signed application trust root. Do not mirror Codex, OpenAI, or another
application's local marketplace into this snapshot.

The current managed-runtime distribution route uses exact GitHub Release asset
URLs. Browser Use upstream `0.13.7` publishes no binary release asset, so its
source archive is not installable; OpenNeko must publish a reproducibly built,
self-contained artifact first. Cua Driver upstream assets likewise remain
unavailable until they satisfy the catalog's contained provenance, license,
signature and platform qualification requirements. A future reviewed official
vendor URL uses the same artifact contract. A user-managed endpoint is a
connector: OpenNeko checks and calls it but never installs or starts its process.
The reviewed upstream coordinates live in
`scripts/automation-runtime-release-inputs.json`; the release checker verifies
exact URLs, sizes and digests and intentionally reports both entries as
non-installable until first-party release evidence is present.
`pnpm prepare:automation-runtime-artifact` can seal the exact Cua Driver
`darwin-arm64` upstream bytes plus a candidate SPDX inventory into a deterministic
OpenNeko candidate. Its receipt remains `catalogReady=false`; do not copy its
facts into this catalog before the upstream Node runtime's unpublished Cargo
lock is replaced by the byte-reproducible first-party runtime, the complete
transitive inventory is reviewed, and release signing and packaged
qualification pass. The first-party command requires two independent builds
to produce identical bytes and receipts; this has passed for the pinned Rust
1.97.1 macOS targets. Candidate SPDX must also cover the exact locked set of
367 production-only Darwin main/Node package identities; identity completeness still does not
satisfy license review, signing, or qualification.

An installable entry may declare `updatesFrom` as the exact package releases
that its reviewed artifact replaces. OpenNeko projects an update only when the
currently installed package release is explicitly listed, the candidate package
metadata is valid, and a reviewed artifact exists for the current Host platform.
A mere release-string mismatch never authorizes an upgrade or downgrade.
