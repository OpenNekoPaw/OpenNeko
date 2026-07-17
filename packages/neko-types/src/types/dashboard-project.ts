export const DASHBOARD_PROJECT_TYPE_DEFINITIONS = [
  { type: 'story', extension: '.fountain' },
  { type: 'canvas', extension: '.nkc' },
  { type: 'video', extension: '.nkv' },
  { type: 'audio', extension: '.nka' },
  { type: 'model', extension: '.nkm' },
  { type: 'puppet', extension: '.nkp' },
  { type: 'sketch', extension: '.nks' },
] as const;

export type DashboardProjectType = (typeof DASHBOARD_PROJECT_TYPE_DEFINITIONS)[number]['type'];

export const DASHBOARD_PROJECT_TYPES: readonly DashboardProjectType[] =
  DASHBOARD_PROJECT_TYPE_DEFINITIONS.map((definition) => definition.type);

export const DASHBOARD_PROJECT_EXTENSIONS: readonly string[] =
  DASHBOARD_PROJECT_TYPE_DEFINITIONS.map((definition) => definition.extension);

export const DASHBOARD_PROJECT_GLOB_EXTENSION_LIST = DASHBOARD_PROJECT_EXTENSIONS.map((extension) =>
  extension.slice(1),
).join(',');

const PROJECT_TYPE_BY_EXTENSION = new Map<string, DashboardProjectType>(
  DASHBOARD_PROJECT_TYPE_DEFINITIONS.map((definition) => [definition.extension, definition.type]),
);

const PROJECT_TYPE_SET = new Set<string>(DASHBOARD_PROJECT_TYPES);

export function getDashboardProjectTypeForExtension(
  extension: string,
): DashboardProjectType | undefined {
  return PROJECT_TYPE_BY_EXTENSION.get(extension.toLowerCase());
}

export function isDashboardProjectType(value: unknown): value is DashboardProjectType {
  return typeof value === 'string' && PROJECT_TYPE_SET.has(value);
}
