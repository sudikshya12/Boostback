import { contactPoints, toWorld } from './geometry';
import { clamp } from './math';
import type { OutcomeKind } from './types';

export interface Pose {
  x: number;
  y: number;
  theta: number;
  legs: number;
}

/** Deck-contact outcomes that crumple the vehicle onto the deck. */
const CRASH_ON_DECK: OutcomeKind[] = [
  'hardLanding',
  'lateralSpeed',
  'excessiveTilt',
  'legsNotDeployed',
  'legsDeploying',
  'bodyCollision',
];

/**
 * Displayed pose after the outcome is decided. Deterministic in the time since
 * the outcome, so the live view and the replay show the same thing.
 *
 * - Successful (or safe but off-zone) touchdowns settle upright onto both feet
 *   with no horizontal sliding.
 * - Deck crashes slump a little in the direction of travel (restrained, no
 *   physics simulation of the wreck).
 * - Ocean impacts settle lower into the water.
 */
export function restingPose(
  final: Pose,
  outcome: OutcomeKind,
  tSince: number,
  vx = 0,
  surface: 'deck' | 'deckEdge' | 'ocean' | null = 'deck',
): Pose {
  const t = Math.max(0, tSince);
  if (outcome === 'outOfBounds') return { ...final };

  if (outcome === 'landed' || outcome === 'outsideZone') {
    const theta = final.theta * Math.exp(-t / 0.18);
    return groundPose({ x: final.x, y: final.y, theta, legs: final.legs }, 0);
  }

  if (CRASH_ON_DECK.includes(outcome) && surface === 'deck') {
    const k = 1 - Math.exp(-t / 0.35);
    const dir = Math.abs(final.theta) > 0.02 ? Math.sign(final.theta) : Math.sign(vx) || 1;
    const extra = outcome === 'hardLanding' ? 0.12 : 0.35;
    const theta = final.theta + dir * extra * k;
    // Collapse: the lowest point sinks slightly into the (damaged) deck surface.
    return groundPose({ x: final.x + dir * 1.2 * k, y: final.y, theta, legs: final.legs }, -1.2 * k);
  }

  // Ocean impact (or striking the deck side): sink below the sea surface and lean.
  const k = clamp(t / 3, 0, 1);
  const dir = Math.sign(final.theta) || Math.sign(vx) || 1;
  return {
    x: final.x,
    y: final.y - 14 * k * k,
    theta: final.theta + dir * 0.5 * k,
    legs: final.legs,
  };
}

/** Shift a pose vertically so its lowest contact point sits at `floor`. */
function groundPose(p: Pose, floor: number): Pose {
  let min = Infinity;
  for (const cp of contactPoints(p.legs)) min = Math.min(min, toWorld(p, cp.local).y);
  return { ...p, y: p.y + (floor - min) };
}
