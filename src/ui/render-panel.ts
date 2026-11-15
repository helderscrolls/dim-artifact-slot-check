/*
 * Redraws the whole panel from the current state. It runs on every DIM
 * refresh and every click, so it is written to be cheap and to keep the
 * player's place in the list.
 */
import type { AppContext } from '../app/context';
import { renderHelp } from './help';
import { renderMainView } from './main-view';
import type { PanelElements } from './panel-elements';
import { renderPill } from './pill';

/** What the list showed last time, to tell a refresh (keep scroll) from a change of view (scroll to top). */
let lastShownKey: string | null = null;

export function renderPanel(context: AppContext, elements: PanelElements): void {
  keepAttachedToPage(elements.host);
  renderPill(context, elements);
  renderFooter(context, elements);

  const previousScrollTop = elements.body.scrollTop;
  const previousShownKey = lastShownKey;

  elements.body.textContent = '';
  elements.tabs.textContent = '';
  elements.filters.textContent = '';

  const shownKey = context.state.view === 'help' ? renderHelpView(context, elements) : renderMainView(context, elements);
  if (shownKey !== null) lastShownKey = shownKey;

  elements.body.scrollTop = lastShownKey === previousShownKey ? previousScrollTop : 0;
}

function renderHelpView(context: AppContext, elements: PanelElements): string {
  elements.tabs.hidden = true;
  elements.filters.hidden = true;
  elements.body.append(renderHelp(context));
  return 'help';
}

function renderFooter(context: AppContext, elements: PanelElements): void {
  const { updatedAt, debug } = context.state;
  elements.footerText.textContent = updatedAt
    ? `Checked ${updatedAt.toLocaleTimeString()} · updates when DIM refreshes`
    : 'No data yet';
  elements.exportButton.disabled = !debug;
}

/** DIM can replace the contents of <body>; if that removed the panel, put it back. */
function keepAttachedToPage(host: HTMLElement): void {
  if (!host.isConnected && document.body) document.body.appendChild(host);
}
