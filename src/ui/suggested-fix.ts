/*
 * The "Suggested fix" card: which perks to move in which slots so that every
 * perk sits in the same position everywhere.
 */
import type { ArtifactPlan } from '../analysis';
import type { AppContext } from '../app/context';
import { el, foldable, labelled, list, ordinal, pairs, pluralizeSlots, step } from './dom';

export function renderSuggestedFix(context: AppContext, characterId: string, plan: ArtifactPlan): HTMLElement {
  const { names, foldedSections } = context;
  const card = foldable(foldedSections, 'card', `plan:${characterId}:${plan.artifactHash}`, true);

  const slotsToResaveCount = plan.changes.length;
  const badgeText = slotsToResaveCount > 0 ? `${pluralizeSlots(slotsToResaveCount)} to re-save` : 'no fix found';
  const summary = el('summary');
  summary.append(
    el('span', 'card-title', `Suggested fix · ${names.artifactName(plan.artifactHash)}`),
    el('span', 'badge', badgeText),
  );

  const content = el('div', 'card-body');

  if (slotsToResaveCount > 0) {
    content.append(el('p', 'lead', 'Move these perks so each one sits in the same position in every slot.'));
    for (const change of plan.changes) {
      const moveRows = change.moves.map((move): [string, string] => [
        names.perkName(move.perkHash),
        `${ordinal(move.from)} → ${ordinal(move.to)}`,
      ]);
      content.append(step(names.slotLabel(change.index, change.nameHash), pairs(moveRows)));
    }
    content.append(
      ...labelled(
        'How to apply, per slot',
        list('ol', ['Equip the slot, in orbit.', 'Rearrange the perks on the artifact.', 'Overwrite the slot.']),
      ),
    );
  }

  if (plan.unchanged.length > 0) {
    content.append(...labelled('Already fine', names.slotNames(plan.unchanged)));
  }
  if (plan.excluded.length > 0) {
    content.append(
      ...labelled("Can't fit", names.slotNames(plan.excluded)),
      el('div', 'muted', 'It needs a perk in a position another build uses, so it will keep clashing.'),
    );
  }

  const searchWasCutShort = plan.exhaustive ? '' : ' The search was cut short, so a shorter fix may exist.';
  content.append(el('p', 'note', `Only positions already seen in your loadouts are suggested.${searchWasCutShort}`));

  card.append(summary, content);
  return card;
}
