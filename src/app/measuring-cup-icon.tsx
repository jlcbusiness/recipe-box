import type { SVGProps } from 'react';

type MeasuringCupIconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'aria-hidden'> & {
  size?: number;
};

// Lucide has no measuring cup; this follows Lucide's 24px grid and 2px rounded stroke.
// Always decorative: the owning button provides the accessible name.
export function MeasuringCup({ size = 24, ...props }: MeasuringCupIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M2 3.5 4.5 6l1.2 13.2a2 2 0 0 0 2 1.8h5.6a2 2 0 0 0 2-1.8L16.5 4H4" />
      <path d="M16.2 8H18a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2.4" />
      <path d="M12.5 9h-3" />
      <path d="M12.5 13h-2" />
      <path d="M12.5 17h-3" />
    </svg>
  );
}
