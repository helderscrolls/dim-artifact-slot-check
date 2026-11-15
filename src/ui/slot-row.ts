/*
 * One saved slot in the list: a single line, which expands to show the perks
 * involved when the slot clashes or needs checking.
 */
import type { SlotResult } from '../analysis';
import type { AppContext } from '../app/context';
import type { NameDirectory } from '../app/names';
import { el, foldable, labelled, ordinal, pairs } from './dom';

const STATUS_LABELS = { ok: 'OK', clash: 'Clash', broken: 'Check artifact' } as const;

export function renderSlotRow(context: AppContext, characterId: string, slot: SlotResult): HTMLElement {
  const { names, foldedSections } = context;

  const rowContent = [
    el('span', 'name', names.slotLabel(slot.index, slot.nameHash)),
    el('span', 'art', names.artifactName(slot.artifactHash)),
    el('span', 'chip', STATUS_LABELS[slot.status]),
  ];

  // A slot with nothing to report is a plain line that cannot be expanded.
  if (slot.status === 'ok') {
    const row = el('div', 'row');
    row.append(...rowContent);
    const box = el('div', `slot ${slot.status}`);
    box.append(row);
    return box;
  }

  const box = foldable(foldedSections, `slot ${slot.status}`, `slot:${characterId}:${slot.index}`, false);
  const row = el('summary', 'row');
  row.append(...rowContent);

  const detail = el('div', 'detail');
  if (slot.clashes.length > 0) {
    detail.append(...labelled('Clashes with other slots', pairs(describeClashesByPerk(names, slot))));
  }
  if (slot.brokenNow.length > 0) {
    const brokenRows = slot.brokenNow.map((brokenPerk): [string, string] => [
      names.perkName(brokenPerk.perkHash),
      `saved ${ordinal(brokenPerk.saved)}, reported ${ordinal(brokenPerk.current)}`,
    ]);
    detail.append(...labelled('Artifact reported differently', pairs(brokenRows)));
  }

  box.append(row, detail);
  return box;
}

/**
 * One line per perk, saying where this slot keeps it and where the other
 * slots keep it, for example "Horde Shuttle: 5th here · 4th in slot 15 · 3rd in slots 18, 20".
 */
function describeClashesByPerk(names: NameDirectory, slot: SlotResult): [string, string][] {
  interface PerkClashes {
    positionHere: number;
    /** Position in the other slots -> the numbers of the slots that keep it there. */
    otherSlotNumbersByPosition: Map<number, string[]>;
  }
  const clashesByPerk = new Map<number, PerkClashes>();

  for (const clash of slot.clashes) {
    for (const clashPerk of clash.perks) {
      const perkClashes = clashesByPerk.get(clashPerk.perkHash) ?? {
        positionHere: clashPerk.here,
        otherSlotNumbersByPosition: new Map<number, string[]>(),
      };
      const slotNumbersAtThisPosition = perkClashes.otherSlotNumbersByPosition.get(clashPerk.there) ?? [];
      slotNumbersAtThisPosition.push(String(clash.otherIndex + 1));
      perkClashes.otherSlotNumbersByPosition.set(clashPerk.there, slotNumbersAtThisPosition);
      clashesByPerk.set(clashPerk.perkHash, perkClashes);
    }
  }

  return [...clashesByPerk].map(([perkHash, perkClashes]): [string, string] => {
    const otherPlaces = [...perkClashes.otherSlotNumbersByPosition].map(([position, slotNumbers]) => {
      const slotWord = slotNumbers.length > 1 ? 'slots' : 'slot';
      return `${ordinal(position)} in ${slotWord} ${slotNumbers.join(', ')}`;
    });
    return [names.perkName(perkHash), `${ordinal(perkClashes.positionHere)} here · ${otherPlaces.join(' · ')}`];
  });
}
