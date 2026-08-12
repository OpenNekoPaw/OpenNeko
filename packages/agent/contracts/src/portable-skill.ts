/** Canonical author-owned Agent Skill definition serialized to SKILL.md. */
export interface PortableSkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly allowedTools?: readonly string[];
}

/** Extra file bundled in a portable Skill directory. */
export type SkillResourceInput =
  | {
      readonly path: string;
      readonly encoding: 'utf8';
      readonly content: string;
    }
  | {
      readonly path: string;
      readonly encoding: 'base64';
      readonly content: string;
    };

export type CreateSkillTarget = 'project' | 'personal';

/** Native creation request. The Host owns the exact destination root. */
export interface CreateSkillInput {
  readonly target: CreateSkillTarget;
  readonly skill: PortableSkillDefinition;
  readonly resources?: readonly SkillResourceInput[];
}

/** Public creation receipt. Filesystem authority and paths remain Host-private. */
export interface CreateSkillResult {
  readonly name: string;
  readonly source: CreateSkillTarget;
  readonly fingerprint: string;
}
