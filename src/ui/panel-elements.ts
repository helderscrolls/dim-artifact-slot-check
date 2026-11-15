/*
 * Builds the empty frame of the panel: the pill, the panel with its header,
 * tabs, filters, body and footer, all inside a shadow root. Nothing is drawn
 * into it here; render-panel.ts fills it.
 */
import { exportDebugFile } from '../app/debug-export';
import { LOG_TAG } from '../app/constants';
import type { AppContext } from '../app/context';
import { button, el } from './dom';
import { PANEL_STYLES } from './styles';
import { enableArrowKeysBetweenTabs } from './tabs';

/** Every element of the panel that later code needs to reach. */
export interface PanelElements {
  /** The outer element added to DIM's page. */
  host: HTMLElement;
  /** The shadow root inside the host; everything else lives in here. */
  shadow: ShadowRoot;
  panel: HTMLElement;
  pill: HTMLButtonElement;
  pillLabel: HTMLElement;
  helpButton: HTMLButtonElement;
  tabs: HTMLElement;
  filters: HTMLElement;
  body: HTMLElement;
  footerText: HTMLElement;
  exportButton: HTMLButtonElement;
}

export function createPanelElements(context: AppContext): PanelElements {
  const host = el('div');
  host.id = 'dim-artifact-slot-check';
  const shadow = host.attachShadow({ mode: 'open' });
  addStyles(shadow);

  const closeButton = button('icon', '×', () => {
    context.setPanelOpen(false);
    pill.focus();
  });
  closeButton.setAttribute('aria-label', 'Close');

  const helpButton = button('icon', '?', () => {
    context.state.view = context.state.view === 'help' ? 'main' : 'help';
    context.redraw();
  });
  helpButton.title = 'What this is and how to use it';
  helpButton.setAttribute('aria-label', 'Help');

  const header = el('div', 'head');
  header.append(el('div', 'title', 'Artifact slot check'), helpButton, closeButton);

  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.hidden = true;
  enableArrowKeysBetweenTabs(tabs);

  const filters = el('div', 'filters');
  filters.hidden = true;

  const body = el('div', 'body');

  const exportButton = button('export', 'Export debug file', () => {
    exportButton.disabled = true;
    exportDebugFile(context)
      .catch((error) => console.warn(LOG_TAG, 'export failed', error))
      .finally(() => context.redraw());
  });
  exportButton.title = 'Saves the artifact data behind this panel as a JSON file. No account or item ids.';
  const footerText = el('span');
  const footer = el('div', 'foot');
  footer.append(footerText, exportButton);

  const panel = el('div', 'panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Artifact slot check');
  panel.append(header, tabs, filters, body, footer);

  const pillLabel = el('span', undefined, 'Artifact check');
  // Screen readers announce the text when a new clash replaces it.
  pillLabel.setAttribute('aria-live', 'polite');
  const pill = el('button', 'pill');
  pill.type = 'button';
  pill.setAttribute('aria-expanded', 'false');
  pill.append(el('span', 'dot'), pillLabel);
  pill.addEventListener('click', () => context.setPanelOpen(!context.state.open));

  shadow.append(panel, pill);
  shadow.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape' && context.state.open) {
      event.stopPropagation();
      context.setPanelOpen(false);
      pill.focus();
    }
  });

  return { host, shadow, panel, pill, pillLabel, helpButton, tabs, filters, body, footerText, exportButton };
}

function addStyles(shadow: ShadowRoot): void {
  try {
    // A constructed stylesheet is not subject to the page's style security policy.
    const stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(PANEL_STYLES);
    shadow.adoptedStyleSheets = [stylesheet];
  } catch {
    shadow.appendChild(el('style', undefined, PANEL_STYLES));
  }
}
