/** Canonical Agent-authored workspace content locations. */

export {
  NEKO_AGENTS_FILE_NAME,
  PERSONAL_NEKO_CONTENT_DIR,
  PROJECT_NEKO_CONTENT_DIR,
  NEKO_CONTENT_SUBDIRS,
  resolveAgentsFile,
  resolveNekoContentDir,
  resolvePersonalAgentsFile,
  resolvePersonalNekoContentDir,
  resolveProjectAgentsFile,
  resolveProjectNekoContentDir,
  type NekoContentSource,
  type NekoContentSubdir,
} from './neko-content-layout';

export {
  AGENT_SKILL_ROOT_DIR,
  AGENT_SKILL_SUBDIR,
  resolveAgentSkillsDir,
  resolvePersonalAgentSkillsDir,
  resolveProjectAgentSkillsDir,
} from './agent-skill-layout';
