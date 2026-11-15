/*
 * What happens when an answer from Bungie arrives: update the state, redraw
 * the panel, and raise the new-clash alert when needed.
 */
import type { ManifestResponse, ProfileResponse } from '../bungie-types';
import { analyze, debugSnapshot, findNewClashes } from '../analysis';
import type { NewClash } from '../analysis';
import type { AppContext } from './context';
import { LOG_TAG } from './constants';
import type { BungieResponseKind } from './network-listener';

export function handleBungieResponse(context: AppContext, kind: BungieResponseKind, json: { Response?: unknown }): void {
  try {
    if (!json?.Response) return;

    if (kind === 'profile') {
      const profileWasHandled = handleProfile(context, json.Response as ProfileResponse);
      if (!profileWasHandled) return;
    } else {
      const namesWereLocated = handleManifest(context, json.Response as ManifestResponse);
      if (!namesWereLocated) return;
    }

    void context.names.loadMissingNames();
  } catch (error) {
    console.warn(LOG_TAG, error);
  }
}

/** Checks the player's loadouts. Returns false when the profile holds no loadouts to check. */
function handleProfile(context: AppContext, profile: ProfileResponse): boolean {
  const { state } = context;
  if (!profile.characterLoadouts) return false;

  const previousAnalysis = state.analysis;
  state.analysis = analyze(profile);

  // The first check has nothing to compare with, so it never raises an alert.
  let freshClashes: NewClash[] = [];
  if (previousAnalysis) {
    freshClashes = findNewClashes(previousAnalysis, state.analysis);
    state.newClashes.push(...freshClashes);
  }

  state.debug = debugSnapshot(profile);
  state.updatedAt = new Date();
  context.redraw();

  if (freshClashes.length > 0) {
    // Wait for the perk and loadout names, so the popup does not show raw ids.
    void context.names.loadMissingNames().then(() => context.showNewClashToast(freshClashes));
  }
  return true;
}

/** Remembers where Bungie's name tables are. Returns false when the answer does not say. */
function handleManifest(context: AppContext, manifest: ManifestResponse): boolean {
  const pathsByLanguage = manifest.jsonWorldComponentContentPaths;
  if (!pathsByLanguage) return false;

  const language = (document.documentElement.lang || 'en').toLowerCase();
  const languageWithoutRegion = language.split('-')[0] ?? language;
  context.state.paths = pathsByLanguage[language] ?? pathsByLanguage[languageWithoutRegion] ?? pathsByLanguage.en ?? null;
  return true;
}
