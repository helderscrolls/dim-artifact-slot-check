import type { ManifestPaths } from '../bungie-types';
import type { Analysis, DebugSnapshot, NewClash, SlotStatus } from '../analysis';

/** Which slots the list shows: everything, or only one status. */
export type StatusFilter = 'all' | SlotStatus;

/** The panel either shows the slot list ("main") or the help page. */
export type PanelView = 'main' | 'help';

/**
 * Everything the panel needs to draw itself. Think of it as the extension's
 * single store: data handlers write to it, and the panel reads from it.
 */
export interface State {
  /** The latest check of the player's saved loadouts. Null until DIM has loaded them. */
  analysis: Analysis | null;
  /** When `analysis` was last updated. */
  updatedAt: Date | null;
  /** Where Bungie's name tables can be downloaded. Null until DIM has asked for them. */
  paths: ManifestPaths | null;
  /** Whether the panel is open. */
  open: boolean;
  /** The character whose tab the player picked, if any. */
  tab: string | null;
  filter: StatusFilter;
  view: PanelView;
  /** Clashes that appeared since the panel was last closed. Cleared once seen. */
  newClashes: NewClash[];
  /** Raw artifact data behind `analysis`, for the debug export. */
  debug: DebugSnapshot | null;
}

export function createState(): State {
  return {
    analysis: null,
    updatedAt: null,
    paths: null,
    open: false,
    tab: null,
    filter: 'all',
    view: 'main',
    newClashes: [],
    debug: null,
  };
}
