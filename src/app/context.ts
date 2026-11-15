import type { NewClash } from '../analysis';
import { NameDirectory } from './names';
import { createState } from './state';
import type { State } from './state';

/**
 * What every part of the extension shares: the state, the name lookup, and a
 * few actions that the panel fills in once it exists. Parts receive it as a
 * parameter, the way an Angular component receives an injected service.
 */
export interface AppContext {
  state: State;
  names: NameDirectory;
  /** DIM's own `fetch`, from before this extension wrapped it. */
  originalFetch: typeof fetch;
  /** Cards and rows the player opened or closed, which must stay that way when the panel redraws. */
  foldedSections: Set<string>;
  /** Redraws the panel from the current state. */
  redraw: () => void;
  /** Opens or closes the panel. */
  setPanelOpen: (open: boolean) => void;
  /** Shows the popup for clashes that just appeared. */
  showNewClashToast: (freshClashes: NewClash[]) => void;
}

export function createContext(originalFetch: typeof fetch): AppContext {
  const state = createState();

  const context: AppContext = {
    state,
    originalFetch,
    foldedSections: new Set<string>(),
    names: new NameDirectory({ state, originalFetch, onNamesLoaded: () => context.redraw() }),
    // Until the panel is mounted these do nothing; it replaces them.
    redraw: () => {},
    setPanelOpen: () => {},
    showNewClashToast: () => {},
  };
  return context;
}
