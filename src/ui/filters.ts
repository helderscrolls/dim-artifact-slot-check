/*
 * The filter chips under the tabs ("All 17", "Clash 3", ...).
 */
import type { CharacterResult, SlotStatus } from '../analysis';
import type { AppContext } from '../app/context';
import type { StatusFilter } from '../app/state';
import { el } from './dom';

interface FilterOption {
  filter: StatusFilter;
  label: string;
  slotCount: number;
}

/**
 * Draws the chips for one character into `filtersElement`, and returns the
 * filter that is active. When there is nothing to tell apart the chips are
 * hidden and everything is shown.
 */
export function renderFilters(
  context: AppContext,
  character: CharacterResult,
  filtersElement: HTMLElement,
): StatusFilter {
  const countSlotsWith = (status: SlotStatus) => character.slots.filter((slot) => slot.status === status).length;
  const options: FilterOption[] = [
    { filter: 'all', label: 'All', slotCount: character.slots.length },
    { filter: 'clash', label: 'Clash', slotCount: countSlotsWith('clash') },
    { filter: 'broken', label: 'Check artifact', slotCount: countSlotsWith('broken') },
    { filter: 'ok', label: 'OK', slotCount: countSlotsWith('ok') },
  ];

  // Filters only help when there is something to tell apart: with a single
  // status present they would just repeat "All".
  const statusesPresent = options.filter((option) => option.filter !== 'all' && option.slotCount > 0).length;
  const filtersAreUseful = statusesPresent >= 2;
  filtersElement.hidden = !filtersAreUseful;
  if (!filtersAreUseful) return 'all';

  // A filter with nothing in it falls back to showing everything.
  const chosenOption = options.find((option) => option.filter === context.state.filter && option.slotCount > 0);
  const activeFilter = chosenOption?.filter ?? 'all';

  for (const option of options) {
    if (option.slotCount === 0 && option.filter !== 'all') continue;

    const chip = el('button', 'filter');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(option.filter === activeFilter));
    if (option.filter !== 'all') chip.append(el('span', `dot ${option.filter}`));
    chip.append(el('span', undefined, `${option.label} ${option.slotCount}`));
    chip.addEventListener('click', () => {
      context.state.filter = option.filter;
      context.redraw();
    });
    filtersElement.append(chip);
  }
  return activeFilter;
}
