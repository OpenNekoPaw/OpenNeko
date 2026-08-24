# retired-extension-archive-policy Specification

## Purpose
Keep the retired and unreachable Desktop Extension archive policy absent from product and test surfaces.
## Requirements
### Requirement: Retired Extension archive policy is absent

The repository SHALL NOT retain the retired Desktop Extension archive policy, tests, registration,
or compatibility entry.

#### Scenario: Repository paths are audited

- **WHEN** source and test paths are scanned
- **THEN** no Desktop Extension archive policy module or consumer exists.
