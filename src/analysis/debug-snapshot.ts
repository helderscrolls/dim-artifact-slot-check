/*
 * The raw artifact data behind an analysis, for troubleshooting. It is what the
 * panel's "Export debug file" button saves. Nothing in it identifies the
 * account, a character or a specific item.
 */
import type { ProfileResponse } from '../bungie-types';
import { ARTIFACT_BUCKET_HASH, UNSET_PLUG_HASH } from './constants';
import { indexItemsByInstanceId } from './profile-items';

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

export function debugSnapshot(profile: ProfileResponse): DebugSnapshot {
  const itemsByInstanceId = indexItemsByInstanceId(profile);

  // Real instance ids stay private; each artifact gets a label like "A1" instead.
  const labelByInstanceId = new Map<string, string>();
  const artifacts: DebugArtifact[] = [];
  for (const [instanceId, item] of itemsByInstanceId) {
    if (item.bucketHash !== ARTIFACT_BUCKET_HASH) continue;

    const label = `A${artifacts.length + 1}`;
    labelByInstanceId.set(instanceId, label);

    const sockets = profile.itemComponents?.sockets?.data?.[instanceId]?.sockets;
    const reusablePlugsPerSocket = profile.itemComponents?.reusablePlugs?.data?.[instanceId]?.plugs;
    artifacts.push({
      id: label,
      itemHash: item.itemHash,
      current: sockets ? sockets.map((socket) => socket.plugHash ?? 0) : null,
      allowed: reusablePlugsPerSocket
        ? Object.fromEntries(
            Object.entries(reusablePlugsPerSocket).map(([socketIndex, reusablePlugs]) => [
              socketIndex,
              reusablePlugs.map((reusablePlug) => ({
                hash: reusablePlug.plugItemHash,
                canInsert: reusablePlug.canInsert,
                enabled: reusablePlug.enabled,
              })),
            ]),
          )
        : null,
    });
  }

  const characters = Object.entries(profile.characterLoadouts?.data ?? {}).map(([characterId, { loadouts = [] }]) => ({
    classType: profile.characters?.data?.[characterId]?.classType ?? -1,
    slots: loadouts.flatMap((loadout, slotIndex) => {
      const filledItems = (loadout.items ?? []).filter(
        (savedItem) => savedItem.itemInstanceId && savedItem.itemInstanceId !== '0',
      );
      if (filledItems.length === 0) return []; // an empty slot

      const savedArtifact = filledItems.find((savedItem) => labelByInstanceId.has(savedItem.itemInstanceId));
      return [
        {
          slot: slotIndex,
          nameHash: loadout.nameHash,
          artifact: savedArtifact ? labelByInstanceId.get(savedArtifact.itemInstanceId)! : null,
          plugs: savedArtifact?.plugItemHashes ?? null,
          itemCount: filledItems.length,
        },
      ];
    }),
  }));

  return { artifacts, characters };
}

/** Every item hash that appears in a debug snapshot, so the export can name them. */
export function debugItemHashes(snapshot: DebugSnapshot): Set<number> {
  const itemHashes = new Set<number>();

  for (const artifact of snapshot.artifacts) {
    itemHashes.add(artifact.itemHash);
    for (const plugHash of artifact.current ?? []) itemHashes.add(plugHash);
    for (const reusablePlugs of Object.values(artifact.allowed ?? {})) {
      for (const reusablePlug of reusablePlugs) itemHashes.add(reusablePlug.hash);
    }
  }
  for (const character of snapshot.characters) {
    for (const slot of character.slots) {
      for (const plugHash of slot.plugs ?? []) itemHashes.add(plugHash);
    }
  }

  // Zero and "unset" are placeholders, not real items.
  itemHashes.delete(0);
  itemHashes.delete(UNSET_PLUG_HASH);
  return itemHashes;
}
