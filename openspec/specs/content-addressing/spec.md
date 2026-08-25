# content-addressing Specification

## Purpose

Define the canonical package-owned identity and validation rules used to reference Workspace and package content across domain, Desktop and DSH boundaries.

## Requirements

### Requirement: Canonical content identity

All durable content references SHALL use the package-owned canonical Content Locator shape with an explicit file authority and normalized path, plus an optional normalized document entry selector.

#### Scenario: Invalid locator is rejected locally

- **WHEN** a producer or consumer receives an unknown authority, absolute path, unsupported field, or unnormalized entry selector
- **THEN** the owning content boundary SHALL return a diagnostic and SHALL NOT select another source, active workspace, or legacy locator shape.

#### Scenario: DSH content operation receives a valid locator

- **WHEN** a DSH document or domain Tool delegates a valid locator
- **THEN** the Host SHALL resolve that exact locator and preserve its identity in the result and any renderer-bound projection.
