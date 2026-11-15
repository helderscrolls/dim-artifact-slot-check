/*
 * Entry point. It runs inside DIM's page and does three things:
 *   1. listens to the answers DIM already gets from Bungie,
 *   2. checks the player's saved loadouts for artifact clashes,
 *   3. shows the result in a small panel.
 * It sends nothing anywhere; the only requests it makes itself are for
 * Bungie's public name tables.
 *
 * Where to look next:
 *   analysis/  the clash rules and the suggested fix (no page code)
 *   app/       listening to Bungie, the shared state, names, the debug export
 *   ui/        everything drawn on the page
 */
import * as analysis from './analysis';
import { createContext } from './app/context';
import type { AppContext } from './app/context';
import { handleBungieResponse } from './app/data-handler';
import { listenToBungieResponses } from './app/network-listener';
import { mountPanel } from './ui/panel';

declare global {
  interface Window {
    /** Set once the extension is running. Used to avoid starting twice, and by the test page. */
    __dimArtifactSlotCheck?: { core: typeof analysis; getState: () => AppContext['state'] };
  }
}

function start(): void {
  if (window.__dimArtifactSlotCheck || typeof window.fetch !== 'function') return;

  // Take DIM's own fetch before wrapping it, so our requests do not trigger the listener.
  const context = createContext(window.fetch);
  listenToBungieResponses(context.originalFetch, (kind, json) => handleBungieResponse(context, kind, json));

  if (document.body) mountPanel(context);
  else document.addEventListener('DOMContentLoaded', () => mountPanel(context));

  window.__dimArtifactSlotCheck = { core: analysis, getState: () => context.state };
}

start();
