import { Play, Settings2, Volume2, VolumeX, Trophy } from 'lucide-react';
import { compatibilityKey, DIFFICULTY_ORDER, PRESETS, type DifficultyId } from '../sim';
import { useGame } from '../game/store';
import { Button, IconButton, Segmented } from './primitives';

export function StartScreen() {
  const settings = useGame((s) => s.settings);
  const bests = useGame((s) => s.data.bests);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const startDescent = useGame((s) => s.startDescent);
  const openTutorial = useGame((s) => s.openTutorial);
  const watchDemo = useGame((s) => s.watchDemo);
  const openPanel = useGame((s) => s.openPanel);
  const updateSettings = useGame((s) => s.updateSettings);
  const preset = PRESETS[settings.difficulty];
  const best = bests[compatibilityKey(preset, settings.controlMode)];

  return (
    <div className="fixed inset-0 z-10 pointer-events-none fade-in">
      <div className="absolute inset-0 bg-gradient-to-r from-[#06111c]/55 via-[#06111c]/10 to-transparent max-sm:bg-gradient-to-t max-sm:from-[#06111c]/70 max-sm:via-[#06111c]/20" />
      <div className="relative h-full flex flex-col justify-between p-5 sm:p-10">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
            <path d="M16 3c2.4 2.2 3.3 5 3.3 7.6V22h-6.6V10.6C12.7 8 13.6 5.2 16 3z" fill="#f3ede2" />
            <path d="M12.7 21.5l-4.2 5.4M19.3 21.5l4.2 5.4" stroke="#f3ede2" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M14.4 23h3.2L16 27.5z" fill="#f2b155" />
          </svg>
          <span className="text-[17px] font-semibold tracking-tight">Boostback</span>
          <span className="text-[13px] text-ink-dim hidden sm:inline">· Rocket Landing Challenge</span>
        </div>

        <div className="max-w-[440px] pointer-events-auto max-sm:mt-auto">
          <p className="text-[13px] text-ink-dim sm:hidden mb-1">Rocket Landing Challenge</p>
          <h1 className="text-[44px] sm:text-[60px] leading-[1.02] font-semibold tracking-[-0.02em] text-ink drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
            Bring it home.
          </h1>
          <div className="mt-6 flex flex-col gap-3">
            <Segmented<DifficultyId>
              label="Difficulty"
              value={settings.difficulty}
              onChange={setDifficulty}
              options={DIFFICULTY_ORDER.map((id) => ({ value: id, label: PRESETS[id].name, hint: PRESETS[id].description }))}
              className="w-full sm:w-auto"
            />
            <p className="text-[14px] text-ink-dim min-h-[2.6em]">{preset.description}</p>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="primary" onClick={startDescent} className="px-6 min-h-12 text-[16px]" data-testid="start">
                <Play size={17} fill="currentColor" aria-hidden /> Start descent
              </Button>
              <Button variant="secondary" onClick={() => openTutorial(false)} className="min-h-12">
                How to play
              </Button>
            </div>
            <div className="flex items-center gap-4 text-[13px] text-ink-dim mt-1">
              <button type="button" onClick={watchDemo} className="underline underline-offset-4 decoration-white/30 hover:text-ink cursor-pointer min-h-8">
                Watch a landing
              </button>
              {best && (
                <span className="inline-flex items-center gap-1.5">
                  <Trophy size={14} className="text-caution" aria-hidden />
                  Best: <span className="num text-ink">{best.touchdownSpeed.toFixed(1)} m/s</span>,{' '}
                  <span className="num text-ink">{best.distance.toFixed(1)} m</span> off centre
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pointer-events-auto max-sm:mt-6">
          <button
            type="button"
            onClick={() => openPanel('about')}
            className="text-[13px] text-ink-dim hover:text-ink underline underline-offset-4 decoration-white/30 cursor-pointer min-h-8"
          >
            About this simulation
          </button>
          <div className="flex gap-2">
            <IconButton label={settings.muted ? 'Unmute sound' : 'Mute sound'} onClick={() => updateSettings({ muted: !settings.muted })}>
              {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </IconButton>
            <IconButton label="Settings" onClick={() => openPanel('settings')}>
              <Settings2 size={18} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
