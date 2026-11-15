/*
 * Clash detection for artifact perks saved in Destiny 2 in-game loadouts.
 *
 * Rule (confirmed by hand in game, Nov 2026): a saved loadout remembers each
 * artifact perk's socket. If one of its perks currently sits in a different
 * socket of the artifact, the game cannot place it and the loadout shows
 * "Contains items with invalid mods".
 *
 * Pure logic: no DOM, no network.
 */
import type { ItemComponent, LoadoutComponent, ProfileResponse } from '../bungie-types';
import { ARTIFACT_BUCKET_HASH, EMPTY_ARTIFACT_PLUG_HASH, UNSET_PLUG_HASH } from './constants';
import { planLayout } from './layout';
import type { PlanResult } from './layout';
import { indexItemsByInstanceId } from './profile-items';

export type SlotStatus = 'ok' | 'clash' | 'broken';

export interface BrokenPerk {
  perkHash: number;
  /** 1-based position the loadout saved the perk in. */
  saved: number;
  /** 1-based position the perk is in on the artifact right now. */
  current: number;
}

export interface ClashPerk {
  perkHash: number;
  /** 1-based position in this slot. */
  here: number;
  /** 1-based position in the other slot. */
  there: number;
}

export interface Clash {
  otherIndex: number;
  otherNameHash: number;
  perks: ClashPerk[];
}

export interface SlotResult {
  /** 0-based in-game loadout slot. */
  index: number;
  nameHash: number;
  artifactHash: number;
  /** False when the profile had no socket data for the artifact. */
  currentKnown: boolean;
  status: SlotStatus;
  brokenNow: BrokenPerk[];
  clashes: Clash[];
}

/** A suggested fix for one artifact: move perks so shared ones line up. Positions are 1-based. */
export interface ArtifactPlan extends PlanResult {
  artifactHash: number;
}

export interface CharacterResult {
  characterId: string;
  classType: number;
  slots: SlotResult[];
  /** One per artifact whose saved slots clash with each other. */
  plans: ArtifactPlan[];
  /** Saved loadouts that hold no artifact perks, so there is nothing to check. */
  savedWithoutArtifact: number;
}

export interface Analysis {
  characters: CharacterResult[];
}

export interface Summary {
  slots: number;
  broken: number;
  clashing: number;
}

/** Perk hash -> socket index. */
type Layout = Map<number, number>;

/** One in-game loadout slot that holds an artifact with perks. */
interface SavedSlot {
  /** 0-based in-game loadout slot. */
  index: number;
  nameHash: number;
  artifactInstanceId: string;
  artifactHash: number;
  layout: Layout;
}

/**
 * Turns a list of plug hashes (one per socket) into perk -> socket index.
 * Empty sockets are skipped: the known empty plug, and as a fallback any hash
 * that appears in more than one socket, since the game never allows the same
 * perk twice.
 */
export function layoutFrom(plugHashes: number[]): Layout {
  const isPerk = (plugHash: number) =>
    Boolean(plugHash) && plugHash !== UNSET_PLUG_HASH && plugHash !== EMPTY_ARTIFACT_PLUG_HASH;

  const socketCountPerPlug = new Map<number, number>();
  for (const plugHash of plugHashes) {
    if (isPerk(plugHash)) socketCountPerPlug.set(plugHash, (socketCountPerPlug.get(plugHash) ?? 0) + 1);
  }

  const layout: Layout = new Map();
  plugHashes.forEach((plugHash, socketIndex) => {
    const appearsOnce = socketCountPerPlug.get(plugHash) === 1;
    if (isPerk(plugHash) && appearsOnce) layout.set(plugHash, socketIndex);
  });
  return layout;
}

/** What the artifact holds right now, as Bungie reports it. Null when Bungie sent no socket data. */
function readCurrentLayout(profile: ProfileResponse, artifactInstanceId: string): Layout | null {
  const sockets = profile.itemComponents?.sockets?.data?.[artifactInstanceId]?.sockets;
  if (!sockets) return null;
  return layoutFrom(sockets.map((socket) => socket.plugHash ?? 0));
}

/**
 * The seven perk sockets are the artifact's first sockets (DIM's CSV export
 * shows perks in sockets 0-6), so position = socket index + 1.
 */
const toPosition = (socketIndex: number) => socketIndex + 1;

/**
 * Perks of one tier have consecutive hashes in a block of eight (seen on all
 * seven artifacts, Nov 2026), and a tier limits which positions a perk can
 * take. Bungie's profile data does not list the positions, so they are
 * learned instead: a perk may go wherever any perk of its tier has been seen,
 * on this account, for the same artifact.
 */
const PERK_HASHES_PER_TIER = 8;
const makeTierKey = (artifactHash: number, perkHash: number) =>
  `${artifactHash}:${Math.floor(perkHash / PERK_HASHES_PER_TIER)}`;

/** For each artifact tier, the socket indexes a perk of that tier has been seen in. */
function collectPositionsSeenPerTier(
  profile: ProfileResponse,
  itemsByInstanceId: Map<string, ItemComponent>,
): Map<string, Set<number>> {
  const positionsSeenPerTier = new Map<string, Set<number>>();

  const recordLayout = (artifactHash: number, layout: Layout) => {
    for (const [perkHash, socketIndex] of layout) {
      const tierKey = makeTierKey(artifactHash, perkHash);
      const positionsSeen = positionsSeenPerTier.get(tierKey) ?? new Set<number>();
      positionsSeen.add(socketIndex);
      positionsSeenPerTier.set(tierKey, positionsSeen);
    }
  };

  // What every copy of the artifact holds right now, on any character...
  for (const [instanceId, item] of itemsByInstanceId) {
    if (item.bucketHash !== ARTIFACT_BUCKET_HASH) continue;
    const layoutNow = readCurrentLayout(profile, instanceId);
    if (layoutNow) recordLayout(item.itemHash, layoutNow);
  }

  // ...and what every saved loadout holds.
  for (const { loadouts = [] } of Object.values(profile.characterLoadouts?.data ?? {})) {
    for (const loadout of loadouts) {
      for (const savedItem of loadout.items ?? []) {
        const item = itemsByInstanceId.get(savedItem.itemInstanceId);
        if (item?.bucketHash === ARTIFACT_BUCKET_HASH) {
          recordLayout(item.itemHash, layoutFrom(savedItem.plugItemHashes ?? []));
        }
      }
    }
  }
  return positionsSeenPerTier;
}

export function analyze(profile: ProfileResponse): Analysis {
  const itemsByInstanceId = indexItemsByInstanceId(profile);
  const positionsSeenPerTier = collectPositionsSeenPerTier(profile, itemsByInstanceId);
  const characters: CharacterResult[] = [];

  for (const [characterId, { loadouts = [] }] of Object.entries(profile.characterLoadouts?.data ?? {})) {
    const { savedSlots, savedWithoutArtifact } = findSavedArtifactSlots(loadouts, itemsByInstanceId);
    const slotResults = savedSlots.map((savedSlot) => checkSlot(savedSlot, savedSlots, profile));

    characters.push({
      characterId,
      classType: profile.characters?.data?.[characterId]?.classType ?? -1,
      slots: slotResults,
      plans: makeFixPlans(savedSlots, slotResults, positionsSeenPerTier),
      savedWithoutArtifact,
    });
  }

  return { characters };
}

/** Picks out the loadout slots that hold an artifact with perks, and counts the other filled slots. */
function findSavedArtifactSlots(
  loadouts: LoadoutComponent[],
  itemsByInstanceId: Map<string, ItemComponent>,
): { savedSlots: SavedSlot[]; savedWithoutArtifact: number } {
  const savedSlots: SavedSlot[] = [];
  let savedWithoutArtifact = 0;

  loadouts.forEach((loadout, slotIndex) => {
    const filledItems = (loadout.items ?? []).filter(
      (savedItem) => savedItem.itemInstanceId && savedItem.itemInstanceId !== '0',
    );
    if (filledItems.length === 0) return; // an empty slot

    const savedArtifact = filledItems.find(
      (savedItem) => itemsByInstanceId.get(savedItem.itemInstanceId)?.bucketHash === ARTIFACT_BUCKET_HASH,
    );
    const layout = savedArtifact ? layoutFrom(savedArtifact.plugItemHashes ?? []) : null;
    if (!savedArtifact || !layout || layout.size === 0) {
      savedWithoutArtifact++;
      return;
    }

    savedSlots.push({
      index: slotIndex,
      nameHash: loadout.nameHash,
      artifactInstanceId: savedArtifact.itemInstanceId,
      artifactHash: itemsByInstanceId.get(savedArtifact.itemInstanceId)!.itemHash,
      layout,
    });
  });

  return { savedSlots, savedWithoutArtifact };
}

/** Compares one saved slot with the artifact as it is now, and with every other slot on the same artifact. */
function checkSlot(slot: SavedSlot, allSlots: SavedSlot[], profile: ProfileResponse): SlotResult {
  const layoutNow = readCurrentLayout(profile, slot.artifactInstanceId);

  const brokenNow: BrokenPerk[] = [];
  for (const [perkHash, savedSocketIndex] of slot.layout) {
    const socketIndexNow = layoutNow?.get(perkHash);
    if (socketIndexNow !== undefined && socketIndexNow !== savedSocketIndex) {
      brokenNow.push({
        perkHash,
        saved: toPosition(savedSocketIndex),
        current: toPosition(socketIndexNow),
      });
    }
  }

  const clashes: Clash[] = [];
  for (const otherSlot of allSlots) {
    const isSameSlot = otherSlot === slot;
    const isOtherArtifact = otherSlot.artifactInstanceId !== slot.artifactInstanceId;
    if (isSameSlot || isOtherArtifact) continue;

    const clashingPerks: ClashPerk[] = [];
    for (const [perkHash, socketIndexHere] of slot.layout) {
      const socketIndexThere = otherSlot.layout.get(perkHash);
      if (socketIndexThere !== undefined && socketIndexThere !== socketIndexHere) {
        clashingPerks.push({
          perkHash,
          here: toPosition(socketIndexHere),
          there: toPosition(socketIndexThere),
        });
      }
    }
    if (clashingPerks.length > 0) {
      clashes.push({ otherIndex: otherSlot.index, otherNameHash: otherSlot.nameHash, perks: clashingPerks });
    }
  }

  // A clash comes from saved data and is certain. "Broken now" depends on
  // Bungie's report of the artifact, which can lag behind in-game edits.
  let status: SlotStatus = 'ok';
  if (clashes.length > 0) status = 'clash';
  else if (brokenNow.length > 0) status = 'broken';

  return {
    index: slot.index,
    nameHash: slot.nameHash,
    artifactHash: slot.artifactHash,
    currentKnown: layoutNow !== null,
    status,
    brokenNow,
    clashes,
  };
}

/** A suggested layout for each artifact whose slots clash with each other. */
function makeFixPlans(
  savedSlots: SavedSlot[],
  slotResults: SlotResult[],
  positionsSeenPerTier: Map<string, Set<number>>,
): ArtifactPlan[] {
  const clashingSlotIndexes = new Set(
    slotResults.filter((slotResult) => slotResult.clashes.length > 0).map((slotResult) => slotResult.index),
  );

  const slotsByArtifactInstance = new Map<string, SavedSlot[]>();
  for (const savedSlot of savedSlots) {
    const slotsOnSameArtifact = slotsByArtifactInstance.get(savedSlot.artifactInstanceId) ?? [];
    slotsOnSameArtifact.push(savedSlot);
    slotsByArtifactInstance.set(savedSlot.artifactInstanceId, slotsOnSameArtifact);
  }

  const plans: ArtifactPlan[] = [];
  for (const slotsOnSameArtifact of slotsByArtifactInstance.values()) {
    const anySlotClashes = slotsOnSameArtifact.some((slot) => clashingSlotIndexes.has(slot.index));
    if (!anySlotClashes) continue;

    const artifactHash = slotsOnSameArtifact[0]!.artifactHash;
    const getAllowedPositions = (perkHash: number) => [
      ...(positionsSeenPerTier.get(makeTierKey(artifactHash, perkHash)) ?? []),
    ];
    const plan = planLayout(slotsOnSameArtifact, getAllowedPositions);

    // The layout search works in socket indexes; show people 1-based positions.
    plans.push({
      ...plan,
      artifactHash,
      changes: plan.changes.map((change) => ({
        ...change,
        moves: change.moves.map((move) => ({ ...move, from: toPosition(move.from), to: toPosition(move.to) })),
      })),
    });
  }
  return plans;
}

export function summarize(analysis: Analysis | null): Summary {
  const summary: Summary = { slots: 0, broken: 0, clashing: 0 };
  for (const character of analysis?.characters ?? []) {
    for (const slot of character.slots) {
      summary.slots++;
      if (slot.status === 'clash') summary.clashing++;
      else if (slot.status === 'broken') summary.broken++;
    }
  }
  return summary;
}

/** Every definition hash the UI needs a name for. */
export function neededHashes(analysis: Analysis): { items: Set<number>; loadoutNames: Set<number> } {
  const itemHashes = new Set<number>();
  const loadoutNameHashes = new Set<number>();

  for (const character of analysis.characters) {
    for (const plan of character.plans) {
      for (const change of plan.changes) {
        for (const move of change.moves) itemHashes.add(move.perkHash);
      }
    }
    for (const slot of character.slots) {
      itemHashes.add(slot.artifactHash);
      loadoutNameHashes.add(slot.nameHash);
      for (const brokenPerk of slot.brokenNow) itemHashes.add(brokenPerk.perkHash);
      for (const clash of slot.clashes) {
        loadoutNameHashes.add(clash.otherNameHash);
        for (const clashPerk of clash.perks) itemHashes.add(clashPerk.perkHash);
      }
    }
  }
  return { items: itemHashes, loadoutNames: loadoutNameHashes };
}
