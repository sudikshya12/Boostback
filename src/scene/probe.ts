/**
 * Small mutable objects shared between scene components and the DOM HUD.
 * Written every frame by the scene; read by the HUD's own animation loop.
 * Nothing here triggers React renders.
 */
export const plumeProbe = { active: false, x: 0, y: 0, strength: 0, ocean: false };

export const screenProbe = {
  /** Deck centre in normalised device coordinates (-1..1). */
  deckX: 0,
  deckY: 0,
  deckOnScreen: true,
  deckBehind: false,
  /** Vehicle centre in NDC. */
  rocketX: 0,
  rocketY: 0,
  ready: false,
};
