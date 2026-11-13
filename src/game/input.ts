import type { ControlInput } from '../sim';

/**
 * Collects held keys and touch controls and turns them into one ControlInput
 * per frame. Lives outside React so input never causes re-renders.
 */
export class InputController {
  private keys = { up: false, down: false, left: false, right: false };
  private touchTilt = 0;
  private touchThrottle: number | null = null;
  private legsRequested = false;

  setKey(key: keyof InputController['keys'], down: boolean) {
    this.keys[key] = down;
  }

  setTouchTilt(dir: -1 | 0 | 1) {
    this.touchTilt = dir;
  }

  /** Absolute throttle from the touch slider while it is being dragged; null when released. */
  setTouchThrottle(v: number | null) {
    this.touchThrottle = v;
  }

  requestLegs() {
    this.legsRequested = true;
  }

  /** Release everything (blur, tab hidden, pause, restart). Leg requests are cleared too. */
  clear() {
    this.keys = { up: false, down: false, left: false, right: false };
    this.touchTilt = 0;
    this.touchThrottle = null;
    this.legsRequested = false;
  }

  sample(): ControlInput {
    const k = this.keys;
    const keyTilt = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    return {
      throttleRate: (k.up ? 1 : 0) - (k.down ? 1 : 0),
      throttleSet: this.touchThrottle,
      tilt: keyTilt !== 0 ? keyTilt : this.touchTilt,
      deployLegs: this.legsRequested,
    };
  }
}

const KEY_MAP: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export function flightKey(code: string) {
  return KEY_MAP[code] ?? null;
}
