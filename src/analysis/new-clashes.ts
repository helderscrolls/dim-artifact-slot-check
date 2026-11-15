/*
 * Spotting clashes that appeared between two checks, for the "you just broke
 * something" alert.
 */
import type { Analysis } from './clash';

/** A pair of slots that clash now but did not clash at the previous check. */
export interface NewClash {
  characterId: string;
  classType: number;
  /** 0-based in-game loadout slot numbers, the lower one first. */
  firstSlotIndex: number;
  firstSlotNameHash: number;
  secondSlotIndex: number;
  secondSlotNameHash: number;
  /** The perks the two slots disagree about. */
  perkHashes: number[];
}

/** The same key whichever of the two slots is named first. */
function makeSlotPairKey(characterId: string, slotIndexA: number, slotIndexB: number): string {
  const lowerSlotIndex = Math.min(slotIndexA, slotIndexB);
  const higherSlotIndex = Math.max(slotIndexA, slotIndexB);
  return `${characterId}:${lowerSlotIndex}:${higherSlotIndex}`;
}

/**
 * Compares two checks and returns the slot pairs that clash in the new one
 * but did not in the old one. Pairs that stopped clashing are not reported.
 */
export function findNewClashes(previousAnalysis: Analysis, currentAnalysis: Analysis): NewClash[] {
  const previousPairKeys = new Set<string>();
  for (const character of previousAnalysis.characters) {
    for (const slot of character.slots) {
      for (const clash of slot.clashes) {
        previousPairKeys.add(makeSlotPairKey(character.characterId, slot.index, clash.otherIndex));
      }
    }
  }

  const newClashes: NewClash[] = [];
  // Each pair shows up twice (once from each slot), so remember what was added.
  const reportedPairKeys = new Set<string>();

  for (const character of currentAnalysis.characters) {
    for (const slot of character.slots) {
      for (const clash of slot.clashes) {
        const pairKey = makeSlotPairKey(character.characterId, slot.index, clash.otherIndex);
        if (previousPairKeys.has(pairKey) || reportedPairKeys.has(pairKey)) continue;
        reportedPairKeys.add(pairKey);

        const thisSlotComesFirst = slot.index < clash.otherIndex;
        newClashes.push({
          characterId: character.characterId,
          classType: character.classType,
          firstSlotIndex: thisSlotComesFirst ? slot.index : clash.otherIndex,
          firstSlotNameHash: thisSlotComesFirst ? slot.nameHash : clash.otherNameHash,
          secondSlotIndex: thisSlotComesFirst ? clash.otherIndex : slot.index,
          secondSlotNameHash: thisSlotComesFirst ? clash.otherNameHash : slot.nameHash,
          perkHashes: clash.perks.map((clashPerk) => clashPerk.perkHash),
        });
      }
    }
  }
  return newClashes;
}
