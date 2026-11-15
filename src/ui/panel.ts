/*
 * Puts the panel on DIM's page and connects it to the rest of the extension.
 */
import type { AppContext } from '../app/context';
import { createPanelElements } from './panel-elements';
import { renderPanel } from './render-panel';
import { createToast } from './toast';

let isMounted = false;

/** Adds the panel and the popup to the page, once. Does nothing if the page has no <body> yet. */
export function mountPanel(context: AppContext): void {
  if (isMounted || !document.body) return;
  isMounted = true;

  const elements = createPanelElements(context);
  const toast = createToast(context);
  elements.shadow.append(toast.element);

  /** Opens or closes the panel. */
  function setPanelOpen(open: boolean): void {
    const { state } = context;
    const firstNewClash = state.newClashes[0];

    // The panel shows the same information as the popup, so the popup is not needed any more.
    if (open) toast.hide();
    // Open on the class that has the new clash.
    if (open && firstNewClash) state.tab = firstNewClash.characterId;
    // Closing the panel counts as having seen the alert.
    if (!open) state.newClashes = [];

    state.open = open;
    elements.panel.hidden = !open;
    elements.pill.setAttribute('aria-expanded', String(open));
    context.redraw();
  }

  // From here on the rest of the extension can open the panel, redraw it and show the popup.
  context.redraw = () => renderPanel(context, elements);
  context.setPanelOpen = setPanelOpen;
  context.showNewClashToast = toast.show;

  document.body.appendChild(elements.host);
  context.redraw();
}
