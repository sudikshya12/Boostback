import { useGame } from '../game/store';
import { PRESETS } from '../sim';
import { Button, Dialog, Kbd } from './primitives';

export function Tutorial() {
  const close = useGame((s) => s.closeTutorial);
  const fromStart = useGame((s) => s.tutorialReturn === 'start');
  const preset = PRESETS[useGame((s) => s.settings.difficulty)];
  const lim = preset.limits;

  return (
    <Dialog title="How to play" onClose={() => close(false)} wide>
      <div className="flex flex-col gap-5 text-[15px] leading-relaxed text-ink-dim">
        <p>
          Your booster is falling toward a platform in the ocean. Slow it down, line it up, deploy the legs, and touch
          down gently and upright inside the deck's marked zone.
        </p>
        <ol className="grid sm:grid-cols-2 gap-3">
          <li className="rounded-xl bg-white/5 p-3.5">
            <p className="text-ink font-medium mb-1.5">1 · Throttle</p>
            <p className="flex items-center gap-1.5 flex-wrap">
              <Kbd>W</Kbd>/<Kbd>↑</Kbd> more, <Kbd>S</Kbd>/<Kbd>↓</Kbd> less. Release to hold the setting.
            </p>
            <p className="mt-1 text-[13.5px]">Thrust slows your fall but burns propellant. Touch: drag the throttle slider.</p>
          </li>
          <li className="rounded-xl bg-white/5 p-3.5">
            <p className="text-ink font-medium mb-1.5">2 · Tilt</p>
            <p className="flex items-center gap-1.5 flex-wrap">
              <Kbd>A</Kbd>/<Kbd>←</Kbd> and <Kbd>D</Kbd>/<Kbd>→</Kbd> lean the booster. Release to return upright.
            </p>
            <p className="mt-1 text-[13.5px]">
              Leaning points the thrust sideways to correct drift. Steering works best with the engine running.
            </p>
          </li>
          <li className="rounded-xl bg-white/5 p-3.5">
            <p className="text-ink font-medium mb-1.5">3 · Landing legs</p>
            <p className="flex items-center gap-1.5 flex-wrap">
              <Kbd>L</Kbd> deploys them. They take about 2 s to lock.
            </p>
            <p className="mt-1 text-[13.5px]">
              {preset.autoLegsAltitude !== null ? 'Training deploys them for you near the deck.' : 'Deploy them before the final approach.'}
            </p>
          </li>
          <li className="rounded-xl bg-white/5 p-3.5">
            <p className="text-ink font-medium mb-1.5">4 · Touchdown ({preset.name})</p>
            <ul className="text-[13.5px] num leading-6">
              <li>Vertical speed ≤ {lim.vertical} m/s</li>
              <li>Horizontal speed ≤ {lim.horizontal} m/s</li>
              <li>Tilt ≤ {lim.tiltDeg}° · feet inside dashed lines</li>
            </ul>
          </li>
        </ol>
        <p className="text-[13.5px]">
          <Kbd>Esc</Kbd> pauses. After a flight, <Kbd>R</Kbd> tries again. Reaching the deck isn't enough: speed, tilt,
          legs and position all have to be within limits.
        </p>
        <div className="flex justify-end gap-2.5">
          {fromStart ? (
            <Button variant="primary" onClick={() => close(true)}>
              Start descent
            </Button>
          ) : (
            <Button variant="primary" onClick={() => close(false)}>
              Got it
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
