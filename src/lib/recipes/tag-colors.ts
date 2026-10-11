import type { CSSProperties } from 'react';

export const tagColorMeta = {
  pink: { label: 'Pink', fill: '#f3c7d0', border: '#d99cb0', text: '#723543' },
  melon: { label: 'Coral', fill: '#f4c9be', border: '#d7aa9f', text: '#744239' },
  peach: { label: 'Peach', fill: '#f6d8b1', border: '#d8bb87', text: '#755a2d' },
  apricot: { label: 'Apricot', fill: '#f4e2b9', border: '#d6c389', text: '#736236' },
  butter: { label: 'Butter', fill: '#ffffcc', border: '#e5dea1', text: '#676215' },
  pale_gold: { label: 'Lime', fill: '#e9efad', border: '#c9d27f', text: '#687132' },
  sage: { label: 'Sage', fill: '#c6dfa5', border: '#a5c67a', text: '#526b3b' },
  mint: { label: 'Mint', fill: '#c0e8c3', border: '#91c79a', text: '#376844' },
  seafoam: { label: 'Seafoam', fill: '#c3e1da', border: '#9dc8c0', text: '#496d69' },
  aqua: { label: 'Cyan', fill: '#c4e7f0', border: '#9dcedc', text: '#436977' },
  powder_blue: { label: 'Powder blue', fill: '#d8e8f8', border: '#a7c8e7', text: '#4d6983' },
  periwinkle: { label: 'Periwinkle', fill: '#e0e5fa', border: '#bcc6ea', text: '#5a688d' },
  sky_lilac: { label: 'Lavender', fill: '#e2ddf9', border: '#c2b5e7', text: '#685d8b' },
  lilac: { label: 'Lilac', fill: '#e6d8f2', border: '#ccb0df', text: '#72517f' },
  orchid: { label: 'Magenta', fill: '#e8c7e1', border: '#d3a1c8', text: '#74586f' },
  grey: { label: 'Grey', fill: '#d8dee8', border: '#b4bcc8', text: '#576070' },
} as const;

export type TagColorKey = keyof typeof tagColorMeta;

export const tagColorOptions = (Object.keys(tagColorMeta) as TagColorKey[]).map((key) => ({
  key,
  ...tagColorMeta[key],
}));

export function getTagColorStyle(colorKey: TagColorKey): CSSProperties {
  const color = tagColorMeta[colorKey];
  return {
    backgroundColor: `color-mix(in srgb, ${color.fill} 48%, transparent)`,
    borderColor: `color-mix(in srgb, ${color.border} 82%, transparent)`,
    color: color.text,
  };
}
