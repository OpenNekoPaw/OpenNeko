/**
 * SlashCommandMenu Component
 * Presentational menu for a precomputed slash command catalog.
 */

import { useRef } from 'react';
import { SlashCommand } from './types';
import {
  resolveSlashCommandDescription,
  resolveSlashCommandSourceLabel,
  resolveSkillInvocationSourceLabel,
  type SkillInvocationCatalogItem,
  type SlashCommandCatalogItem,
} from './slash-command-catalog';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';

interface SlashCommandMenuProps {
  isOpen: boolean;
  commands: SlashCommandCatalogItem[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

interface SkillInvocationMenuProps {
  isOpen: boolean;
  skills: SkillInvocationCatalogItem[];
  selectedIndex: number;
  onSelect: (skill: SkillInvocationCatalogItem) => void;
  onClose: () => void;
}

type SlashCommandDisplayGroup = 'agent' | 'creation' | 'command';
type SkillInvocationDisplayGroup = 'skill';

interface SlashCommandSection {
  group: SlashCommandDisplayGroup;
  title: string | null;
  commands: SlashCommandCatalogItem[];
  startIndex: number;
}

interface SkillInvocationSection {
  group: SkillInvocationDisplayGroup;
  title: string | null;
  skills: SkillInvocationCatalogItem[];
  startIndex: number;
}

const slashCommandDisplayGroupOrder: readonly SlashCommandDisplayGroup[] = [
  'agent',
  'creation',
  'command',
];

const creationBuiltinCommands = new Set(['skills', 'tools', 'tasks']);

export function SlashCommandMenu({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  if (!isOpen || commands.length === 0) return null;

  const sections = buildSlashCommandSections(commands, t);

  return (
    <div ref={menuRef} className="agent-composer-popover agent-composer-command-menu" role="menu">
      <div className="agent-composer-popover-scroll">
        {sections.map((section) => (
          <div key={section.group}>
            {section.title && <div className="agent-composer-popover-section">{section.title}</div>}
            {section.commands.map((cmd, itemIndex) => {
              const flatIndex = section.startIndex + itemIndex;
              const description = resolveSlashCommandDescription(cmd, t);
              const sourceLabel = resolveSlashCommandSourceLabel(cmd);
              const isSelected = flatIndex === selectedIndex;

              return (
                <CommandMenuRow
                  key={cmd.id}
                  name={cmd.name}
                  description={description}
                  sourceLabel={sourceLabel}
                  isSelected={isSelected}
                  onClick={() => onSelect(cmd)}
                  translate={t}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkillInvocationMenu({
  isOpen,
  skills,
  selectedIndex,
  onSelect,
  onClose,
}: SkillInvocationMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  if (!isOpen || skills.length === 0) return null;

  const sections = buildSkillInvocationSections(skills, t);

  return (
    <div ref={menuRef} className="agent-composer-popover agent-composer-command-menu" role="menu">
      <div className="agent-composer-popover-scroll">
        {sections.map((section) => (
          <div key={section.group}>
            {section.title && <div className="agent-composer-popover-section">{section.title}</div>}
            {section.skills.map((skill, itemIndex) => {
              const flatIndex = section.startIndex + itemIndex;
              const description = resolveSlashCommandDescription(skill, t);
              const sourceLabel = resolveSkillInvocationSourceLabel(skill);
              const isSelected = flatIndex === selectedIndex;

              return (
                <CommandMenuRow
                  key={skill.id}
                  name={skill.name}
                  description={description}
                  sourceLabel={sourceLabel}
                  isSelected={isSelected}
                  onClick={() => onSelect(skill)}
                  translate={t}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSlashCommandSections(
  commands: SlashCommandCatalogItem[],
  translate: (key: string, params?: Record<string, string | number>) => string,
): SlashCommandSection[] {
  const sections: SlashCommandSection[] = [];
  let startIndex = 0;
  const sortedCommands = sortSlashCommandsForDisplay(commands);

  for (const group of slashCommandDisplayGroupOrder) {
    const sectionCommands = sortedCommands.filter(
      (command) => projectSlashCommandGroup(command) === group,
    );
    if (sectionCommands.length === 0) continue;
    sections.push({
      group,
      title: resolveSlashCommandSectionTitle(group, translate),
      commands: sectionCommands,
      startIndex,
    });
    startIndex += sectionCommands.length;
  }

  return sections;
}

function buildSkillInvocationSections(
  skills: SkillInvocationCatalogItem[],
  translate: (key: string, params?: Record<string, string | number>) => string,
): SkillInvocationSection[] {
  const sortedSkills = sortSkillInvocationsForDisplay(skills);
  if (sortedSkills.length === 0) return [];
  return [
    {
      group: 'skill',
      title: resolveSkillInvocationSectionTitle(translate),
      skills: sortedSkills,
      startIndex: 0,
    },
  ];
}

export function sortSlashCommandsForDisplay(
  commands: readonly SlashCommandCatalogItem[],
): SlashCommandCatalogItem[] {
  return [...commands].sort((a, b) => {
    const groupOrder =
      slashCommandDisplayGroupOrder.indexOf(projectSlashCommandGroup(a)) -
      slashCommandDisplayGroupOrder.indexOf(projectSlashCommandGroup(b));
    if (groupOrder !== 0) return groupOrder;
    return commands.indexOf(a) - commands.indexOf(b);
  });
}

export function sortSkillInvocationsForDisplay(
  skills: readonly SkillInvocationCatalogItem[],
): SkillInvocationCatalogItem[] {
  return [...skills];
}

export function projectSlashCommandGroup(
  command: SlashCommandCatalogItem,
): SlashCommandDisplayGroup {
  if (command.source === 'command-artifact') return 'command';
  if (command.source === 'plugin') return 'creation';
  if (creationBuiltinCommands.has(command.commandId ?? command.id)) return 'creation';
  return 'agent';
}

function CommandMenuRow({
  name,
  description,
  sourceLabel,
  isSelected,
  onClick,
  translate,
}: {
  readonly name: string;
  readonly description: string;
  readonly sourceLabel: string | null;
  readonly isSelected: boolean;
  readonly onClick: () => void;
  readonly translate: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`agent-composer-popover-row agent-composer-command-row ${
        isSelected ? 'is-selected' : ''
      }`}
      role="menuitem"
    >
      <span className={`agent-composer-popover-primary ${isSelected ? 'is-selected' : ''}`}>
        {name}
      </span>
      <span className="agent-composer-popover-secondary">{description}</span>
      {sourceLabel && (
        <span className="agent-composer-popover-badge">
          {resolveSlashCommandSourceLabelText(sourceLabel, translate)}
        </span>
      )}
    </button>
  );
}

function resolveSlashCommandSectionTitle(
  group: SlashCommandDisplayGroup,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `chat.commands.sections.${group}`;
  const translated = translate(key);
  if (translated !== key) return translated;
  if (group === 'command') return 'Commands';
  if (group === 'creation') return 'Creation';
  return 'Agent';
}

function resolveSkillInvocationSectionTitle(
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = 'chat.commands.sections.skill';
  const translated = translate(key);
  return translated === key ? 'Skills' : translated;
}

function resolveSlashCommandSourceLabelText(
  sourceLabel: string,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const key = `chat.commands.source.${sourceLabel}`;
  const translated = translate(key);
  return translated === key ? sourceLabel : translated;
}
