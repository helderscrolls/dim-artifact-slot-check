/*
 * The row of tabs, one per class that has saved slots.
 */
import type { CharacterResult, SlotStatus } from '../analysis';
import { classNameOf } from '../app/constants';
import type { AppContext } from '../app/context';
import { el } from './dom';

/** One tab button. Its dot shows the worst status among that class's slots. */
export function renderTab(
  context: AppContext,
  tabsElement: HTMLElement,
  character: CharacterResult,
  isSelected: boolean,
): HTMLElement {
  let worstStatus: SlotStatus = 'ok';
  if (character.slots.some((slot) => slot.status === 'clash')) worstStatus = 'clash';
  else if (character.slots.some((slot) => slot.status === 'broken')) worstStatus = 'broken';

  const tab = el('button', `tab ${worstStatus}`);
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(isSelected));
  tab.tabIndex = isSelected ? 0 : -1;
  tab.append(el('span', 'dot'), el('span', undefined, classNameOf(character.classType)));

  tab.addEventListener('click', () => {
    context.state.tab = character.characterId;
    context.redraw();
    // The tabs were rebuilt, so this button is gone; put keyboard focus on the new selected one.
    tabsElement.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  });
  return tab;
}

/** Makes the left and right arrow keys move between tabs, wrapping at both ends. */
export function enableArrowKeysBetweenTabs(tabsElement: HTMLElement): void {
  tabsElement.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    const tabButtons = [...tabsElement.querySelectorAll<HTMLElement>('.tab')];
    const selectedIndex = tabButtons.findIndex((tabButton) => tabButton.getAttribute('aria-selected') === 'true');
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (selectedIndex + step + tabButtons.length) % tabButtons.length;
    tabButtons[nextIndex]?.click();
  });
}
