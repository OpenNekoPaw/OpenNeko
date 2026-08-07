import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION,
  MEDIA_GENERATION_DELIVERY_CONFIG_SECTION,
  MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
  MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaGenerationDeliverySettingsPlan,
} from '../media-generation-delivery-settings';

describe('media-generation-delivery-settings', () => {
  it('exposes host configuration schema constants', () => {
    expect(MEDIA_GENERATION_DELIVERY_CONFIG_SECTION).toBe('neko.agent.media');
    expect(MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY).toBe('outputDir');
    expect(MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY).toBe('showSaveNotification');
    expect(DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR).toBe('');
    expect(DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION).toBe(true);
  });

  it('uses host-provided default output dir and enables save notifications by default', () => {
    expect(
      buildMediaGenerationDeliverySettingsPlan({
        workspaceRoot: '/repo',
        defaultOutputDir: '/home/.neko/workspace-cache/workspace-id/generated',
      }),
    ).toEqual({
      workspaceRoot: '/repo',
      outputDir: '/home/.neko/workspace-cache/workspace-id/generated',
      showSaveNotification: true,
    });
  });

  it('uses configured output dir and notification preference when provided', () => {
    expect(
      buildMediaGenerationDeliverySettingsPlan({
        workspaceRoot: '/repo',
        configuredOutputDir: '/tmp/neko-output',
        configuredShowSaveNotification: false,
      }),
    ).toEqual({
      workspaceRoot: '/repo',
      outputDir: '/tmp/neko-output',
      showSaveNotification: false,
    });
  });

  it('omits file output settings without a workspace root', () => {
    expect(buildMediaGenerationDeliverySettingsPlan({})).toEqual({
      showSaveNotification: true,
    });
  });
});
