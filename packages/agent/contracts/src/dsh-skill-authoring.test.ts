import { describe, expect, it } from 'vitest';

import {
  CREATE_SKILL_DSH_TOOL_PARAMETERS,
  decodeCreateDshSkillInput,
  decodeCreateDshSkillResult,
} from './dsh-skill-authoring';

describe('DSH Skill authoring contract', () => {
  it('keeps destination and Host paths out of the Tool schema', () => {
    const serialized = JSON.stringify(CREATE_SKILL_DSH_TOOL_PARAMETERS);
    expect(serialized).not.toMatch(/destination|workspaceId|root|absolutePath/iu);
    expect(CREATE_SKILL_DSH_TOOL_PARAMETERS.layout.enum).toEqual(['directory', 'flat']);
  });

  it('decodes native Markdown and optional resources without an OpenNeko manifest', () => {
    expect(
      decodeCreateDshSkillInput({
        layout: 'directory',
        skillMarkdown: '---\nname: sample-skill\ndescription: Sample.\n---\n# Sample',
        resources: [{ path: 'references/guide.md', content: '# Guide' }],
      }),
    ).toEqual({
      layout: 'directory',
      skillMarkdown: '---\nname: sample-skill\ndescription: Sample.\n---\n# Sample',
      resources: [{ path: 'references/guide.md', content: '# Guide' }],
    });
    expect(() =>
      decodeCreateDshSkillInput({
        layout: 'directory',
        skillMarkdown: 'valid',
        resources: [],
        destination: 'workspace',
      }),
    ).toThrow(/fields are invalid/u);
  });

  it('strictly distinguishes ready and pending discovery results', () => {
    expect(
      decodeCreateDshSkillResult({
        status: 'created-shadowed',
        name: 'sample-skill',
        layout: 'directory',
        source: 'project-dsh',
        provider: 'local',
      }),
    ).toMatchObject({ status: 'created-shadowed', source: 'project-dsh' });
    expect(
      decodeCreateDshSkillResult({
        status: 'ready',
        name: 'sample-skill',
        layout: 'flat',
        source: 'project-agents',
        provider: 'local',
      }),
    ).toMatchObject({ status: 'ready', source: 'project-agents' });
    expect(
      decodeCreateDshSkillResult({
        status: 'created-pending-discovery',
        name: 'sample-skill',
        layout: 'directory',
      }),
    ).toMatchObject({ status: 'created-pending-discovery' });
  });
});
