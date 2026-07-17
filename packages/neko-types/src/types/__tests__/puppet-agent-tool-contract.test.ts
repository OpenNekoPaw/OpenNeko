import { describe, expect, it } from 'vitest';
import { TOOL_NAMES, TOOL_NAMES_PUPPET } from '../index';

describe('puppet agent tool contract', () => {
  it('registers native puppet tool names in unified TOOL_NAMES', () => {
    expect(TOOL_NAMES_PUPPET.PUPPET_QUERY).toBe('puppet:query');
    expect(TOOL_NAMES_PUPPET.PUPPET_CREATE_NATIVE).toBe('puppet:create_native');
    expect(TOOL_NAMES_PUPPET.PUPPET_SET_EXPRESSION).toBe('puppet:set_expression');
    expect(TOOL_NAMES_PUPPET.PUPPET_SET_BLENDSHAPE).toBe('puppet:set_blendshape');
    expect(TOOL_NAMES_PUPPET.PUPPET_SET_BONE).toBe('puppet:set_bone');
    expect(TOOL_NAMES_PUPPET.PUPPET_SET_CONTROL_DRIVER).toBe('puppet:set_control_driver');
    expect(TOOL_NAMES_PUPPET.PUPPET_PLAY_ANIMATION).toBe('puppet:play_animation');
    expect(TOOL_NAMES_PUPPET.PUPPET_AUTO_RIG).toBe('puppet:auto_rig');
    expect(TOOL_NAMES_PUPPET.PUPPET_GENERATE_ANIMATION).toBe('puppet:generate_animation');

    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PUPPET.PUPPET_QUERY);
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PUPPET.PUPPET_SET_BLENDSHAPE);
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PUPPET.PUPPET_AUTO_RIG);
  });
});
