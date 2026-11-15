/*
 * The words used for a new clash, shared by the pill, the popup and the banner
 * at the top of the panel, so all three describe it the same way.
 */
import type { NewClash } from '../analysis';
import { classNameOf } from '../app/constants';
import type { NameDirectory } from '../app/names';

/** Two lines about one new clash: who clashes with whom, and over which perks. */
export function describeNewClash(names: NameDirectory, newClash: NewClash): { heading: string; perkNames: string } {
  const className = classNameOf(newClash.classType);
  const firstSlotName = names.slotLabel(newClash.firstSlotIndex, newClash.firstSlotNameHash);
  const secondSlotName = names.slotLabel(newClash.secondSlotIndex, newClash.secondSlotNameHash);
  const perkNames = newClash.perkHashes.map((perkHash) => names.perkName(perkHash)).join(', ');

  return { heading: `${className}: ${firstSlotName} and ${secondSlotName}`, perkNames };
}

/** Short text for the pill, for example "New clash: slot 3 and slot 11". */
export function describeNewClashesShort(newClashes: NewClash[]): string {
  const firstNewClash = newClashes[0];
  if (newClashes.length === 1 && firstNewClash) {
    return `New clash: slot ${firstNewClash.firstSlotIndex + 1} and slot ${firstNewClash.secondSlotIndex + 1}`;
  }
  return `${newClashes.length} new clashes`;
}
