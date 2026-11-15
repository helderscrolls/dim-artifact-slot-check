/*
 * The red box at the top of the panel that lists the clashes which appeared
 * since the player last looked.
 */
import type { AppContext } from '../app/context';
import { button, el, step } from './dom';
import { describeNewClash } from './new-clash-text';

export function renderNewClashBanner(context: AppContext): HTMLElement {
  const { state, names } = context;
  const banner = el('div', 'card alert');

  const title =
    state.newClashes.length === 1
      ? 'New clash since the last refresh'
      : `${state.newClashes.length} new clashes since the last refresh`;
  const dismissButton = button('back', 'Dismiss', () => {
    state.newClashes = [];
    context.redraw();
  });
  const header = el('div', 'alert-header');
  header.append(el('span', 'card-title', title), dismissButton);

  const content = el('div', 'card-body');
  for (const newClash of state.newClashes) {
    const { heading, perkNames } = describeNewClash(names, newClash);
    content.append(step(heading, el('div', undefined, `They keep these perks in different positions: ${perkNames}.`)));
  }
  content.append(el('p', 'note', 'Saving a build over a slot can cause this. See "Suggested fix" below.'));

  banner.append(header, content);
  return banner;
}
