/** Starts every message this extension writes to the browser console. */
export const LOG_TAG = '[Artifact Slot Check]';

/** Bungie's class numbers, as shown to the player. */
const CLASS_NAMES: Record<number, string> = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

export function classNameOf(classType: number): string {
  return CLASS_NAMES[classType] ?? 'Character';
}

/** The address of the profile request DIM makes, which holds the player's loadouts and items. */
export const PROFILE_URL_PATTERN = /\/Platform\/Destiny2\/\d+\/Profile\/\d+\//i;

/** The address of the request that lists where Bungie keeps its name tables. */
export const MANIFEST_URL_PATTERN = /\/Platform\/Destiny2\/Manifest\/?(\?|$)/i;

/** Where perk and loadout names are remembered, so they are only downloaded once. */
export const NAME_CACHE_KEY = 'dim-artifact-slot-check:names:v1';

/** How long the new-clash popup stays on screen before it hides itself. */
export const TOAST_VISIBLE_MILLISECONDS = 10_000;

/** The popup lists at most this many clashes; the rest are summarised. */
export const MAX_CLASHES_IN_TOAST = 3;

export const DEBUG_FILE_NAME = 'artifact-slot-check-debug.json';
