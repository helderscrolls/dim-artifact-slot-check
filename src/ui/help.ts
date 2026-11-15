/*
 * The help page behind the "?" button: what the panel checks, what the
 * colours mean, and how to fix a clash.
 */
import type { AppContext } from '../app/context';
import { button, el, list } from './dom';

/** A heading followed by its content. */
function section(title: string, ...content: HTMLElement[]): HTMLElement[] {
  return [el('h3', undefined, title), ...content];
}

/** The three status dots, each with a sentence saying what it means. */
function renderLegend(): HTMLElement {
  const legend = el('div', 'legend');
  const legendRows: [string, string][] = [
    ['ok', 'OK: nothing to do.'],
    ['clash', 'Clash: this slot and another keep a shared perk in different positions. Equipping one breaks the other.'],
    [
      'broken',
      "Check artifact: the slot is fine, but Bungie reports the artifact arranged differently. Often just Bungie's data running behind.",
    ],
  ];
  for (const [status, meaning] of legendRows) {
    legend.append(el('span', `dot ${status}`), el('span', undefined, meaning));
  }
  return legend;
}

export function renderHelp(context: AppContext): HTMLElement {
  const backButton = button('back', '← Back', () => {
    context.state.view = 'main';
    context.redraw();
  });

  const help = el('div', 'help');
  help.append(
    backButton,
    ...section(
      'What this checks',
      el(
        'p',
        undefined,
        'A saved in-game loadout remembers the position of each artifact perk. If a perk sits in a different ' +
          'position when you equip the loadout, the game leaves it out and shows "Contains items with invalid mods".',
      ),
      el('p', undefined, 'This panel compares your saved slots and warns you before that happens.'),
    ),
    ...section('Colours', renderLegend()),
    ...section(
      'Fixing a clash',
      el('p', undefined, 'Open "Suggested fix". For each slot it lists:'),
      list('ol', [
        'Equip the slot, in orbit.',
        'On the artifact, move the listed perks to the new positions.',
        'Overwrite the slot from the in-game loadout screen.',
      ]),
      el('p', 'note', 'Some builds cannot share a layout. Those are listed under "Can\'t fit".'),
    ),
    ...section(
      'Finding your way around',
      list('ul', [
        'Tabs switch between your classes.',
        'The chips under the tabs filter slots by status.',
        'Click a slot to see which perks are involved.',
        'The panel updates each time DIM refreshes.',
      ]),
    ),
    ...section(
      'Good habits',
      list('ul', [
        'Save your builds to in-game slots in one sitting.',
        'Avoid rearranging artifact perks by hand unless a fix asks for it.',
        'Check the dot before starting an activity.',
      ]),
    ),
    ...section(
      'Your data',
      el(
        'p',
        undefined,
        'Everything comes from the data DIM already downloads. Nothing is sent anywhere. "Export debug file" ' +
          'saves the artifact data behind this panel, with no account or item ids, for troubleshooting.',
      ),
    ),
  );
  return help;
}
