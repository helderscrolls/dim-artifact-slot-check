/*
 * The popup in the top right corner that announces a new clash, where DIM shows
 * its own notices.
 */
import type { NewClash } from '../analysis';
import { MAX_CLASHES_IN_TOAST, TOAST_VISIBLE_MILLISECONDS } from '../app/constants';
import type { AppContext } from '../app/context';
import { button, el } from './dom';
import { describeNewClash } from './new-clash-text';

export interface Toast {
  element: HTMLElement;
  show: (freshClashes: NewClash[]) => void;
  hide: () => void;
}

export function createToast(context: AppContext): Toast {
  const element = el('div', 'toast');
  element.hidden = true;
  let hideTimerId: number | undefined;

  function startHideTimer(): void {
    window.clearTimeout(hideTimerId);
    hideTimerId = window.setTimeout(hide, TOAST_VISIBLE_MILLISECONDS);
  }

  function cancelHideTimer(): void {
    window.clearTimeout(hideTimerId);
  }

  function hide(): void {
    cancelHideTimer();
    element.hidden = true;
  }

  function show(freshClashes: NewClash[]): void {
    // While the panel is open it already shows these clashes at the top.
    if (context.state.open) return;

    element.textContent = '';
    element.append(buildHeader(freshClashes.length), ...buildClashLines(freshClashes));
    element.append(buildActions());
    element.hidden = false;
    startHideTimer();
  }

  function buildHeader(clashCount: number): HTMLElement {
    const title = clashCount === 1 ? 'New artifact clash' : `${clashCount} new artifact clashes`;
    const dismissButton = button('icon', '×', hide);
    dismissButton.setAttribute('aria-label', 'Dismiss');

    const header = el('div', 'toast-head');
    header.append(el('span', 'toast-title', title), dismissButton);
    return header;
  }

  function buildClashLines(freshClashes: NewClash[]): HTMLElement[] {
    const lines: HTMLElement[] = [];
    for (const freshClash of freshClashes.slice(0, MAX_CLASHES_IN_TOAST)) {
      const { heading, perkNames } = describeNewClash(context.names, freshClash);
      lines.push(el('div', 'toast-line', heading), el('div', 'toast-line muted', perkNames));
    }

    const hiddenClashCount = freshClashes.length - MAX_CLASHES_IN_TOAST;
    if (hiddenClashCount > 0) lines.push(el('div', 'toast-line muted', `and ${hiddenClashCount} more`));
    return lines;
  }

  function buildActions(): HTMLElement {
    const actions = el('div', 'toast-actions');
    actions.append(button('back', 'Open panel', () => context.setPanelOpen(true)));
    return actions;
  }

  // Reading takes time: the popup stays while the mouse or keyboard focus is on it.
  element.addEventListener('mouseenter', cancelHideTimer);
  element.addEventListener('mouseleave', startHideTimer);
  element.addEventListener('focusin', cancelHideTimer);
  element.addEventListener('focusout', startHideTimer);
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  return { element, show, hide };
}
