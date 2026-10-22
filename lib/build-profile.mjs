// Build tooling replaces only this edition literal in each release artifact.
export const BUILD_EDITION = 'full-animation';
export const FULL_ANIMATION_EDITION = BUILD_EDITION === 'full-animation';

export function approvedMotionStyle(style) {
  return style === 'umi' || style === 'illustration';
}
