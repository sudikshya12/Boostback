import { DECK, VEHICLE } from './config';
import type { Recording } from './types';

export interface Observation {
  text: string;
  tone: 'good' | 'info' | 'warn';
}

const f1 = (v: number) => v.toFixed(1);

/**
 * One or two observations, each backed by something in the recording. These
 * describe what happened; they never claim a different action would certainly
 * have worked (that counterfactual is not simulated).
 */
export function observations(rec: Recording): Observation[] {
  const r = rec.report;
  if (!r) return [];
  const out: Observation[] = [];
  const lim = rec.scenario.limits;
  const fuelOut = rec.events.find((e) => e.type === 'fuelOut');
  const legsCmd = rec.events.find((e) => e.type === 'legsCommanded' || e.type === 'legsAuto');
  const samples = rec.samples;
  const last = samples[samples.length - 1];

  switch (r.outcome) {
    case 'landed':
      out.push({
        text: `Touchdown at ${f1(-r.vy)} m/s with ${Math.round(r.fuelFraction * 100)}% propellant remaining.`,
        tone: 'good',
      });
      out.push({
        text: `Centre of mass ${f1(r.distanceFromCenter)} m from the target centre; tilt ${f1(Math.abs(r.tiltDeg))}°.`,
        tone: 'info',
      });
      break;
    case 'hardLanding':
      out.push({
        text: `Vertical speed at contact was ${f1(-r.vy)} m/s, above the ${f1(lim.vertical)} m/s landing limit.`,
        tone: 'warn',
      });
      break;
    case 'lateralSpeed':
      out.push({
        text: `Horizontal speed at contact was ${f1(Math.abs(r.vx))} m/s, above the ${f1(lim.horizontal)} m/s limit.`,
        tone: 'warn',
      });
      break;
    case 'excessiveTilt':
      out.push({
        text: `The booster was tilted ${f1(Math.abs(r.tiltDeg))}° at contact; the limit is ${f1(lim.tiltDeg)}°.`,
        tone: 'warn',
      });
      break;
    case 'legsNotDeployed':
      out.push({
        text: `Landing legs were never deployed. They take ${f1(VEHICLE.legs.deployTime)} s to lock after the command.`,
        tone: 'warn',
      });
      break;
    case 'legsDeploying':
      out.push({
        text: legsCmd
          ? `Landing legs were still deploying at contact (${Math.round(r.legs * 100)}% locked). They were commanded ${f1(r.t - legsCmd.t)} s before contact.`
          : `Landing legs were still deploying at contact (${Math.round(r.legs * 100)}% locked).`,
        tone: 'warn',
      });
      break;
    case 'outsideZone':
      out.push({
        text: `The outermost foot touched ${f1(Math.max(Math.abs(r.feetX[0]), Math.abs(r.feetX[1])))} m from centre; the usable deck extends ${f1(rec.scenario.usableHalfWidth)} m.`,
        tone: 'warn',
      });
      break;
    case 'oceanImpact': {
      const wasOverDeck = samples.some((s) => s.alt < 150 && Math.abs(s.x) <= DECK.halfWidth);
      out.push({
        text: wasOverDeck
          ? 'The rocket crossed the deck boundary before touchdown.'
          : `The booster came down ${f1(Math.max(0, r.distanceFromCenter - DECK.halfWidth))} m beyond the deck edge.`,
        tone: 'warn',
      });
      break;
    }
    case 'bodyCollision':
      out.push({ text: 'Part of the booster body struck the platform before the landing feet.', tone: 'warn' });
      break;
    case 'outOfBounds':
      out.push({ text: 'The booster climbed or drifted outside the recovery area.', tone: 'warn' });
      break;
  }

  if (r.outcome !== 'landed') {
    if (fuelOut) {
      const at = samples.find((s) => s.t >= fuelOut.t) ?? last;
      out.push({
        text: `Propellant ran out at ${f1(fuelOut.t)} s, ${Math.round(at.alt)} m above the deck.`,
        tone: 'warn',
      });
    } else if (r.outcome === 'hardLanding' && last && last.thr < 0.5) {
      out.push({
        text: `Throttle was ${Math.round(last.thr * 100)}% at contact with ${Math.round(r.fuelFraction * 100)}% propellant still on board.`,
        tone: 'info',
      });
    } else if (r.failures.length > 1) {
      out.push({ text: `${r.failures.length - 1} other touchdown condition(s) also failed — see the checks below.`, tone: 'info' });
    }
  }
  return out.slice(0, 2);
}
