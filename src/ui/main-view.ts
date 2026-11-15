/*
 * The main view of the panel: the tabs, the filter chips, and the list of
 * cards and slots for the selected class.
 */
import type { CharacterResult } from '../analysis';
import { classNameOf } from '../app/constants';
import type { AppContext } from '../app/context';
import { findArtifactDrifts, renderArtifactDrift } from './artifact-drift';
import { el } from './dom';
import { renderFilters } from './filters';
import { renderNewClashBanner } from './new-clash-banner';
import type { PanelElements } from './panel-elements';
import { renderSlotRow } from './slot-row';
import { renderSuggestedFix } from './suggested-fix';
import { renderTab } from './tabs';

/**
 * Fills the tabs, filters and body for the current state. Returns a key that
 * names what is showing (so the caller can tell a refresh from a change of
 * view), or null when there is nothing to show yet.
 */
export function renderMainView(context: AppContext, elements: PanelElements): string | null {
  const { state } = context;

  const charactersWithSlots = state.analysis?.characters.filter((candidate) => candidate.slots.length > 0) ?? [];
  const selectedCharacter = chooseCharacter(charactersWithSlots, state.tab);

  elements.tabs.hidden = charactersWithSlots.length < 2;
  for (const tabCharacter of charactersWithSlots) {
    elements.tabs.append(renderTab(context, elements.tabs, tabCharacter, tabCharacter === selectedCharacter));
  }
  elements.filters.hidden = !selectedCharacter;

  if (!state.analysis) {
    elements.body.append(el('p', 'note', 'Waiting for DIM to load your inventory. Refresh DIM if this does not change.'));
    return null;
  }
  if (!selectedCharacter) {
    elements.body.append(el('p', 'note', 'None of your saved in-game loadouts include an artifact with perks.'));
    return null;
  }

  const activeFilter = renderFilters(context, selectedCharacter, elements.filters);
  const showsClashes = activeFilter === 'all' || activeFilter === 'clash';
  const showsCheckArtifact = activeFilter === 'all' || activeFilter === 'broken';
  const characterId = selectedCharacter.characterId;

  // With a single class there are no tabs, so name the class above the list.
  if (elements.tabs.hidden) elements.body.append(el('div', 'char', classNameOf(selectedCharacter.classType)));
  if (state.newClashes.length > 0) elements.body.append(renderNewClashBanner(context));
  if (showsClashes) {
    for (const plan of selectedCharacter.plans) {
      elements.body.append(renderSuggestedFix(context, characterId, plan));
    }
  }
  if (showsCheckArtifact) {
    for (const drift of findArtifactDrifts(selectedCharacter)) {
      elements.body.append(renderArtifactDrift(context, characterId, drift));
    }
  }
  for (const slot of selectedCharacter.slots) {
    if (activeFilter === 'all' || slot.status === activeFilter) {
      elements.body.append(renderSlotRow(context, characterId, slot));
    }
  }

  return `${characterId}:${activeFilter}`;
}

/** The tab the player picked, else the first class with a problem, else the first class. */
function chooseCharacter(characters: CharacterResult[], pickedCharacterId: string | null): CharacterResult | undefined {
  const pickedCharacter = characters.find((character) => character.characterId === pickedCharacterId);
  const firstCharacterWithAProblem = characters.find((character) =>
    character.slots.some((slot) => slot.status !== 'ok'),
  );
  return pickedCharacter ?? firstCharacterWithAProblem ?? characters[0];
}
