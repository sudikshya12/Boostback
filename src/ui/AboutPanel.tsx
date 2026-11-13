import { SIM_VERSION, VEHICLE } from '../sim';
import { useGame } from '../game/store';
import { Dialog } from './primitives';

const SOURCES = [
  { href: 'https://www.spacex.com/vehicles/falcon-9/', label: 'SpaceX — Falcon 9 vehicle overview' },
  { href: 'https://www.spacex.com/mission/', label: 'SpaceX — Mission (reusability)' },
  { href: 'https://www.grc.nasa.gov/www/k-12/rocket/rktfor.html', label: 'NASA Glenn — Forces on a rocket' },
  { href: 'https://www.grc.nasa.gov/www/k-12/rocket/gimbaled.html', label: 'NASA Glenn — Gimbaled thrust' },
  { href: 'https://www.grc.nasa.gov/www/k-12/rocket/rktthsum.html', label: 'NASA Glenn — Rocket thrust summary' },
];

export function AboutPanel() {
  const close = () => useGame.getState().openPanel(null);
  return (
    <Dialog title="About this simulation" onClose={close} wide>
      <div className="flex flex-col gap-4 text-[14.5px] leading-relaxed text-ink-dim">
        <p>
          <span className="text-ink">Boostback</span> is an educational game about the final seconds of a reusable
          booster's return: braking, lining up, and touching down on a platform at sea. The booster (“BB-07”), the
          platform and every number in the model are fictional and tuned for play. This is not flight software, and it
          is not affiliated with or endorsed by any launch company.
        </p>
        <p>
          The name refers to the <em>boostback</em> burn that turns a real booster around after stage separation. Version 1
          models only the final descent that follows.
        </p>
        <div>
          <h3 className="text-ink font-medium mb-1">What is modelled</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>A 2D rigid body: position, velocity, tilt and rotation rate, updated 120 times per second.</li>
            <li>Gravity, engine thrust and simplified air drag relative to a deterministic, seeded wind.</li>
            <li>
              Propellant use from thrust and specific impulse; the booster gets lighter as it burns, so the same throttle
              decelerates it more.
            </li>
            <li>
              Steering by gimballing the engine (±{((VEHICLE.maxGimbal * 180) / Math.PI).toFixed(0)}°), which only works while
              it's firing, plus weak cold-gas thrusters near the top.
            </li>
            <li>Landing legs that take time to lock, and swept collision checks so nothing passes through the deck.</li>
          </ul>
        </div>
        <div>
          <h3 className="text-ink font-medium mb-1">What is left out</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Real vehicle data, guidance algorithms, or telemetry. The model has not been validated against real flights.</li>
            <li>Out-of-plane motion, aerodynamic torque, grid-fin control, engine start-up limits and minimum throttle.</li>
            <li>Changing centre of mass, propellant slosh, deck motion, leg compression and structural loads.</li>
          </ul>
          <p className="mt-1.5">
            The braking cue is an estimate from this simplified model (full throttle, current tilt, no drag) and is
            hidden when those assumptions don't hold.
          </p>
        </div>
        <div>
          <h3 className="text-ink font-medium mb-1">Background reading</h3>
          <ul className="space-y-1">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noreferrer noopener" className="text-guide underline underline-offset-4 decoration-guide/40 hover:decoration-guide">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-ink font-medium mb-1">Accessibility</h3>
          <p>
            Menus, settings, instructions and post-flight reports work with a keyboard and screen readers. The flight
            itself is a real-time visual task. Pause, attitude assist, reduced motion and the Training preset help, but
            they don't make it fully accessible without sight.
          </p>
        </div>
        <p className="text-[12.5px] text-ink-faint">
          Simulation v{SIM_VERSION}. Audio is synthesized in the browser. The project documentation covers architecture,
          the physics model, and known limitations.
        </p>
      </div>
    </Dialog>
  );
}
