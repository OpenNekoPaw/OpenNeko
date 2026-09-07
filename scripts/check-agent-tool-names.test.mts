import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CANVAS_DSH_TOOL_NAME } from '@neko/canvas-domain';
import { CREATE_SKILL_DSH_TOOL_NAME } from '@neko/agent-contracts/dsh-skill-authoring';
import { CONTENT_IMAGE_DSH_TOOL_NAME, CONTENT_IMAGES_DSH_TOOL_NAME } from '@neko/content-domain';
import { CUT_DSH_TOOL_NAME } from '@neko/cut-domain';
import { GENERATION_DSH_TOOL_NAME } from '@neko/generation-domain';
import { DOCUMENT_DSH_TOOL_NAME } from '@neko/content-domain/document';
import { CHARACTER_DSH_TOOL_NAME } from '@neko/chara-domain/application';
import { WORLD_DSH_TOOL_NAME } from '@neko/world-domain/application';

const providerToolNamePattern = /^[a-zA-Z0-9_-]+$/u;

test('production Agent Tool names are accepted by provider function-name schemas', () => {
  for (const toolName of [
    CREATE_SKILL_DSH_TOOL_NAME,
    WORLD_DSH_TOOL_NAME,
    CHARACTER_DSH_TOOL_NAME,
    DOCUMENT_DSH_TOOL_NAME,
    CONTENT_IMAGE_DSH_TOOL_NAME,
    CONTENT_IMAGES_DSH_TOOL_NAME,
    GENERATION_DSH_TOOL_NAME,
    CANVAS_DSH_TOOL_NAME,
    CUT_DSH_TOOL_NAME,
  ]) {
    assert.match(toolName, providerToolNamePattern);
  }
});
