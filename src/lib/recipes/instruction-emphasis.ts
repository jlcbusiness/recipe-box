export const instructionEmphasisOptions = [
  { value: 'none', label: 'None', color: null, group: 'none' },
  { value: 'navy', label: 'Navy', color: '#334155', group: 'dark' },
  { value: 'red', label: 'Red', color: '#c62828', group: 'standard' },
  { value: 'dark_red', label: 'Dark Red', color: '#6f1721', group: 'dark' },
  { value: 'orange', label: 'Orange', color: '#9f5200', group: 'standard' },
  { value: 'dark_orange', label: 'Dark Orange', color: '#713400', group: 'dark' },
  { value: 'yellow', label: 'Yellow', color: '#7a6500', group: 'standard' },
  { value: 'teal', label: 'Dark Yellow', color: '#403400', group: 'dark' },
  { value: 'green', label: 'Green', color: '#236637', group: 'standard' },
  { value: 'dark_green', label: 'Dark Green', color: '#004b2c', group: 'dark' },
  { value: 'blue', label: 'Blue', color: '#1d6096', group: 'standard' },
  { value: 'dark_blue', label: 'Dark Blue', color: '#002c5e', group: 'dark' },
  { value: 'purple', label: 'Purple', color: '#68407c', group: 'standard' },
  { value: 'dark_purple', label: 'Dark Purple', color: '#471d66', group: 'dark' },
  { value: 'pink', label: 'Pink', color: '#a33561', group: 'standard' },
  { value: 'black', label: 'Dark Pink', color: '#681b4f', group: 'dark' },
] as const;

export type InstructionEmphasisColor = (typeof instructionEmphasisOptions)[number]['value'];

export const defaultInstructionEmphasis = {
  ingredient: 'blue',
  temperature: 'red',
  duration: 'orange',
} as const satisfies Record<'ingredient' | 'temperature' | 'duration', InstructionEmphasisColor>;

export function isInstructionEmphasisColor(value: unknown): value is InstructionEmphasisColor {
  return instructionEmphasisOptions.some((option) => option.value === value);
}

export function getInstructionEmphasisColor(value: InstructionEmphasisColor): string | undefined {
  return instructionEmphasisOptions.find((option) => option.value === value)?.color ?? undefined;
}
