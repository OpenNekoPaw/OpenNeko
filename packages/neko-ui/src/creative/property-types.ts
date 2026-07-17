export type PropertyValue = string | number | boolean;

export interface PropertyOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface PropertyBase {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly animatable?: boolean;
  readonly hasKeyframes?: boolean;
  readonly isAtKeyframe?: boolean;
}

export type PropertyDefinition =
  | NumberPropertyDefinition
  | SliderPropertyDefinition
  | TextPropertyDefinition
  | ColorPropertyDefinition
  | BooleanPropertyDefinition
  | SelectPropertyDefinition;

export type NumberPropertyDefinition = PropertyBase & {
  readonly kind: 'number';
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
};

export type SliderPropertyDefinition = PropertyBase & {
  readonly kind: 'slider';
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
};

export type TextPropertyDefinition = PropertyBase & {
  readonly kind: 'text';
  readonly value: string;
};

export type ColorPropertyDefinition = PropertyBase & {
  readonly kind: 'color';
  readonly value: string;
  readonly alpha?: number;
};

export type BooleanPropertyDefinition = PropertyBase & {
  readonly kind: 'boolean';
  readonly value: boolean;
};

export type SelectPropertyDefinition = PropertyBase & {
  readonly kind: 'select';
  readonly value: string;
  readonly options: readonly PropertyOption[];
};

export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
