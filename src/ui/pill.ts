/*
 * The pill in the bottom-left corner: its colour and its text.
 */
import { summarize } from '../analysis';
import type { AppContext } from '../app/context';
import { describeNewClashesShort } from './new-clash-text';
import type { PanelElements } from './panel-elements';

type PillStatus = 'idle' | 'ok' | 'clash' | 'broken';

export function renderPill(context: AppContext, elements: PanelElements): void {
  const { state } = context;

  // Clashes come from saved data and are certain, so only they turn the
  // pill red. "Check artifact" depends on Bungie's report, which can lag.
  const summary = summarize(state.analysis);
  let status: PillStatus = 'idle';
  let text = 'Artifact check: waiting for DIM';

  if (state.analysis) {
    if (summary.clashing > 0) {
      status = 'clash';
      text = `${summary.clashing} artifact ${summary.clashing === 1 ? 'slot clashes' : 'slots clash'}`;
    } else if (summary.broken > 0) {
      status = 'broken';
      text = 'Check artifact';
    } else if (summary.slots > 0) {
      status = 'ok';
      text = 'Artifact slots OK';
    } else {
      text = 'No artifact loadouts';
    }
  }

  // A new clash takes over the pill until the panel is opened.
  if (state.newClashes.length > 0 && !state.open) {
    status = 'clash';
    text = describeNewClashesShort(state.newClashes);
  }

  elements.pill.className = `pill ${status}`;
  elements.pillLabel.textContent = text;
  elements.helpButton.setAttribute('aria-pressed', String(state.view === 'help'));
}
