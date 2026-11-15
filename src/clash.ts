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
import type { ItemComponent, ProfileResponse } from './bungie-types';
import { planLayout } from './layout';
import type { PlanResult } from './layout';

/** Marks "nothing saved for this socket" in an in-game loadout. */
export const UNSET_PLUG_HASH = 2166136261;
/** "Empty Artifact Mod": what an artifact socket holds when no perk is slotted. */
export const EMPTY_ARTIFACT_PLUG_HASH = 1235188590;
/** Inventory bucket that holds artifacts. */
export const ARTIFACT_BUCKET_HASH = 1506418338;

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
  here: number;
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

interface SavedSlot {
  index: number;
  nameHash: number;
  instanceId: string;
  artifactHash: number;
  layout: Layout;
}

function indexItems(profile: ProfileResponse): Map<string, ItemComponent> {
  const map = new Map<string, ItemComponent>();
  const add = (items?: ItemComponent[]) => {
    for (const item of items ?? []) {
      if (item.itemInstanceId) map.set(item.itemInstanceId, item);
    }
  };
  add(profile.profileInventory?.data?.items);
  for (const component of [profile.characterInventories, profile.characterEquipment]) {
    for (const inventory of Object.values(component?.data ?? {})) add(inventory.items);
  }
  return map;
}

/**
 * Turns a list of plug hashes (one per socket) into perk -> socket index.
 * Empty sockets are skipped: the known empty plug, and as a fallback any hash
 * that appears in more than one socket, since the game never allows the same
 * perk twice.
 */
export function layoutFrom(hashes: number[]): Layout {
  const isPerk = (h: number) => Boolean(h) && h !== UNSET_PLUG_HASH && h !== EMPTY_ARTIFACT_PLUG_HASH;
  const counts = new Map<number, number>();
  for (const h of hashes) {
    if (isPerk(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const layout: Layout = new Map();
  hashes.forEach((h, i) => {
    if (isPerk(h) && counts.get(h) === 1) layout.set(h, i);
  });
  return layout;
}

function currentLayout(profile: ProfileResponse, instanceId: string): Layout | null {
  const sockets = profile.itemComponents?.sockets?.data?.[instanceId]?.sockets;
  return sockets ? layoutFrom(sockets.map((s) => s.plugHash ?? 0)) : null;
}

/**
 * The seven perk sockets are the artifact's first sockets (DIM's CSV export
 * shows perks in sockets 0-6), so position = socket index + 1.
 */
const positionOf = (socketIndex: number) => socketIndex + 1;

/**
 * Perks of one tier have consecutive hashes in a block of eight (seen on all
 * seven artifacts, Nov 2026), and a tier limits which positions a perk can
 * take. Bungie's profile data does not list the positions, so they are
 * learned instead: a perk may go wherever any perk of its tier has been seen,
 * on this account, for the same artifact.
 */
const tierKey = (artifactHash: number, perkHash: number) => `${artifactHash}:${Math.floor(perkHash / 8)}`;

function observedPositions(profile: ProfileResponse, items: Map<string, ItemComponent>): Map<string, Set<number>> {
  const seen = new Map<string, Set<number>>();
  const note = (artifactHash: number, layout: Layout) => {
    for (const [perkHash, socketIndex] of layout) {
      const key = tierKey(artifactHash, perkHash);
      seen.set(key, (seen.get(key) ?? new Set()).add(socketIndex));
    }
  };
  // What every copy of the artifact holds right now, on any character...
  for (const [instanceId, item] of items) {
    if (item.bucketHash !== ARTIFACT_BUCKET_HASH) continue;
    const current = currentLayout(profile, instanceId);
    if (current) note(item.itemHash, current);
  }
  // ...and what every saved loadout holds.
  for (const { loadouts = [] } of Object.values(profile.characterLoadouts?.data ?? {})) {
    for (const loadout of loadouts) {
      for (const saved of loadout.items ?? []) {
        const item = items.get(saved.itemInstanceId);
        if (item?.bucketHash === ARTIFACT_BUCKET_HASH) note(item.itemHash, layoutFrom(saved.plugItemHashes ?? []));
      }
    }
  }
  return seen;
}

export function analyze(profile: ProfileResponse): Analysis {
  const items = indexItems(profile);
  const seen = observedPositions(profile, items);
  const characters: CharacterResult[] = [];

  for (const [characterId, { loadouts = [] }] of Object.entries(profile.characterLoadouts?.data ?? {})) {
    const slots: SavedSlot[] = [];
    let savedWithoutArtifact = 0;

    loadouts.forEach((loadout, index) => {
      const saved = (loadout.items ?? []).filter((it) => it.itemInstanceId && it.itemInstanceId !== '0');
      if (!saved.length) return; // empty slot
      const artifact = saved.find((it) => items.get(it.itemInstanceId)?.bucketHash === ARTIFACT_BUCKET_HASH);
      const layout = artifact ? layoutFrom(artifact.plugItemHashes ?? []) : null;
      if (!artifact || !layout?.size) {
        savedWithoutArtifact++;
        return;
      }
      slots.push({
        index,
        nameHash: loadout.nameHash,
        instanceId: artifact.itemInstanceId,
        artifactHash: items.get(artifact.itemInstanceId)!.itemHash,
        layout,
      });
    });

    const results = slots.map((slot): SlotResult => {
      const current = currentLayout(profile, slot.instanceId);

      const brokenNow: BrokenPerk[] = [];
      for (const [perkHash, socketIndex] of slot.layout) {
        const currentIndex = current?.get(perkHash);
        if (currentIndex !== undefined && currentIndex !== socketIndex) {
          brokenNow.push({ perkHash, saved: positionOf(socketIndex), current: positionOf(currentIndex) });
        }
      }

      const clashes: Clash[] = [];
      for (const other of slots) {
        if (other === slot || other.instanceId !== slot.instanceId) continue;
        const perks: ClashPerk[] = [];
        for (const [perkHash, socketIndex] of slot.layout) {
          const otherIndex = other.layout.get(perkHash);
          if (otherIndex !== undefined && otherIndex !== socketIndex) {
            perks.push({ perkHash, here: positionOf(socketIndex), there: positionOf(otherIndex) });
          }
        }
        if (perks.length) clashes.push({ otherIndex: other.index, otherNameHash: other.nameHash, perks });
      }

      return {
        index: slot.index,
        nameHash: slot.nameHash,
        artifactHash: slot.artifactHash,
        currentKnown: current !== null,
        // A clash comes from saved data and is certain. "Broken now" depends on
        // Bungie's report of the artifact, which can lag behind in-game edits.
        status: clashes.length ? 'clash' : brokenNow.length ? 'broken' : 'ok',
        brokenNow,
        clashes,
      };
    });

    // A suggested layout for each artifact whose slots clash with each other.
    const plans: ArtifactPlan[] = [];
    const clashing = new Set(results.filter((r) => r.clashes.length).map((r) => r.index));
    const byArtifact = new Map<string, SavedSlot[]>();
    for (const slot of slots) byArtifact.set(slot.instanceId, [...(byArtifact.get(slot.instanceId) ?? []), slot]);
    for (const group of byArtifact.values()) {
      if (!group.some((slot) => clashing.has(slot.index))) continue;
      const artifactHash = group[0]!.artifactHash;
      const plan = planLayout(group, (perkHash) => [...(seen.get(tierKey(artifactHash, perkHash)) ?? [])]);
      plans.push({
        ...plan,
        artifactHash,
        changes: plan.changes.map((change) => ({
          ...change,
          moves: change.moves.map((m) => ({ ...m, from: positionOf(m.from), to: positionOf(m.to) })),
        })),
      });
    }

    characters.push({
      characterId,
      classType: profile.characters?.data?.[characterId]?.classType ?? -1,
      slots: results,
      plans,
      savedWithoutArtifact,
    });
  }

  return { characters };
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

export interface DebugArtifact {
  /** Stand-in label; real instance ids are left out of the export. */
  id: string;
  itemHash: number;
  /** Plug hash currently in each socket. */
  current: number[] | null;
  /** Per socket index: plugs Bungie says the socket can hold. */
  allowed: Record<number, { hash: number; canInsert: boolean; enabled: boolean }[]> | null;
}

export interface DebugSnapshot {
  artifacts: DebugArtifact[];
  characters: {
    classType: number;
    slots: { slot: number; nameHash: number; artifact: string | null; plugs: number[] | null; itemCount: number }[];
  }[];
}

/**
 * The raw artifact data behind an analysis, for troubleshooting. Holds no
 * account, character or item instance ids.
 */
export function debugSnapshot(profile: ProfileResponse): DebugSnapshot {
  const items = indexItems(profile);
  const labels = new Map<string, string>();
  const artifacts: DebugArtifact[] = [];
  for (const [instanceId, item] of items) {
    if (item.bucketHash !== ARTIFACT_BUCKET_HASH) continue;
    const id = `A${artifacts.length + 1}`;
    labels.set(instanceId, id);
    const sockets = profile.itemComponents?.sockets?.data?.[instanceId]?.sockets;
    const plugs = profile.itemComponents?.reusablePlugs?.data?.[instanceId]?.plugs;
    artifacts.push({
      id,
      itemHash: item.itemHash,
      current: sockets ? sockets.map((s) => s.plugHash ?? 0) : null,
      allowed: plugs
        ? Object.fromEntries(
            Object.entries(plugs).map(([socketIndex, list]) => [
              socketIndex,
              list.map((p) => ({ hash: p.plugItemHash, canInsert: p.canInsert, enabled: p.enabled })),
            ]),
          )
        : null,
    });
  }

  const characters = Object.entries(profile.characterLoadouts?.data ?? {}).map(([characterId, { loadouts = [] }]) => ({
    classType: profile.characters?.data?.[characterId]?.classType ?? -1,
    slots: loadouts.flatMap((loadout, slot) => {
      const saved = (loadout.items ?? []).filter((it) => it.itemInstanceId && it.itemInstanceId !== '0');
      if (!saved.length) return [];
      const artifact = saved.find((it) => labels.has(it.itemInstanceId));
      return [
        {
          slot,
          nameHash: loadout.nameHash,
          artifact: artifact ? labels.get(artifact.itemInstanceId)! : null,
          plugs: artifact?.plugItemHashes ?? null,
          itemCount: saved.length,
        },
      ];
    }),
  }));

  return { artifacts, characters };
}

/** Every item hash that appears in a debug snapshot. */
export function debugItemHashes(snapshot: DebugSnapshot): Set<number> {
  const hashes = new Set<number>();
  for (const artifact of snapshot.artifacts) {
    hashes.add(artifact.itemHash);
    for (const h of artifact.current ?? []) hashes.add(h);
    for (const list of Object.values(artifact.allowed ?? {})) for (const p of list) hashes.add(p.hash);
  }
  for (const character of snapshot.characters) {
    for (const slot of character.slots) for (const h of slot.plugs ?? []) hashes.add(h);
  }
  hashes.delete(0);
  hashes.delete(UNSET_PLUG_HASH);
  return hashes;
}

/** Every definition hash the UI needs a name for. */
export function neededHashes(analysis: Analysis): { items: Set<number>; loadoutNames: Set<number> } {
  const items = new Set<number>();
  const loadoutNames = new Set<number>();
  for (const character of analysis.characters) {
    for (const plan of character.plans) {
      for (const change of plan.changes) for (const move of change.moves) items.add(move.perkHash);
    }
    for (const slot of character.slots) {
      items.add(slot.artifactHash);
      loadoutNames.add(slot.nameHash);
      for (const perk of slot.brokenNow) items.add(perk.perkHash);
      for (const clash of slot.clashes) {
        loadoutNames.add(clash.otherNameHash);
        for (const perk of clash.perks) items.add(perk.perkHash);
      }
    }
  }
  return { items, loadoutNames };
}
