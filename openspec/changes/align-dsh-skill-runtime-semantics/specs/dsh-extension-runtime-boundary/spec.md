## MODIFIED Requirements

### Requirement: Skill content and runtime authority remain distinct

DSH-owned Skill content MAY contain reusable methods, domain judgment, output guidance and instructions for public models or Tools. Skill content MUST NOT grant trust, Tool visibility, permission, executable Plugin authority, Workspace authorization or Host access; those facts SHALL remain in the current DSH Tool catalog/schema, sandbox/approval policy, Host authorization and official profile. OpenNeko qualification MUST NOT reject a DSH-valid Skill solely because its prose names a public Tool, command or parameter. Package-private ACP/MCP transport, Host permission procedures and internal package schema SHALL remain owner documentation rather than portable Skill claims.

#### Scenario: Skill explains an available generation Tool

- **WHEN** a Skill gives user-facing guidance for an available generation Tool and the exact turn exposes that Tool through DSH
- **THEN** the guidance MAY participate in the Skill body
- **AND** invocation SHALL still be validated and authorized only by the Tool owner and DSH permission path

#### Scenario: Skill claims a private Host protocol grants access

- **WHEN** Skill prose claims that an internal ACP method, path or payload bypasses Host authorization
- **THEN** the claim SHALL confer no runtime capability and the attempted operation SHALL fail at the owning boundary
- **AND** sibling Skills SHALL remain loadable
