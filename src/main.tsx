import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { runtime } from './game/runtime';
import { useGame } from './game/store';
import './index.css';

// Development-only handle for debugging and visual QA. Not present in production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__boostback = { runtime, useGame };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
