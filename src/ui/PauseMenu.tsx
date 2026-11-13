import { Play, RotateCcw, Settings2, Home } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { Button } from './primitives';

export function PauseMenu() {
  const resume = useGame((s) => s.resume);
  const restart = useGame((s) => s.restart);
  const toMenu = useGame((s) => s.toMenu);
  const openPanel = useGame((s) => s.openPanel);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 fade-in" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="panel !bg-panel-solid/90 w-[min(92vw,320px)] p-5 flex flex-col gap-2.5 rise-in">
        <h2 className="text-[18px] font-semibold mb-1">Paused</h2>
        <p className="text-[13.5px] text-ink-dim -mt-1 mb-2">Physics and propellant use are frozen.</p>
        <Button ref={first} variant="primary" onClick={resume}>
          <Play size={16} fill="currentColor" aria-hidden /> Resume
        </Button>
        <Button onClick={restart}>
          <RotateCcw size={16} aria-hidden /> Restart attempt
        </Button>
        <Button onClick={() => openPanel('settings')}>
          <Settings2 size={16} aria-hidden /> Settings
        </Button>
        <Button variant="ghost" onClick={toMenu}>
          <Home size={16} aria-hidden /> Main menu
        </Button>
      </div>
    </div>
  );
}
