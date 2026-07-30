/**
 * Skill Message Handlers
 *
 * Handles: Pi Skill catalog projection.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { SkillsListMessage } from './messages';
import { projectInputSkillSummaries } from '@/presenters/skill-presenter';

/**
 * Handle 'skillsList' - Available skills from extension
 */
const handleSkillsList: MessageHandler<'skillsList'> = (message: SkillsListMessage, context) => {
  context.setSkills(projectInputSkillSummaries(message.skills));
};

export const skillHandlers: HandlerRegistration[] = [defineHandler('skillsList', handleSkillsList)];
