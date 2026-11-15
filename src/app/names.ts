/*
 * Turns Bungie's numeric hashes into names players recognise ("Horde Shuttle",
 * "Slot 3 · Strand"). The names come from Bungie's public tables, which are
 * downloaded once and then remembered in the browser's local storage.
 */
import { neededHashes } from '../analysis';
import { LOG_TAG, NAME_CACHE_KEY } from './constants';
import type { State } from './state';

interface NameCache {
  /** Item hash -> name, for perks and artifacts. */
  items: Record<number, string>;
  /** Loadout name hash -> name, for names like "Strand" or "Raid". */
  loadouts: Record<number, string>;
}

interface NameDirectoryDependencies {
  state: State;
  originalFetch: typeof fetch;
  /** Called after new names arrive, so the panel can redraw with them. */
  onNamesLoaded: () => void;
}

interface SlotRef {
  index: number;
  nameHash: number;
}

export class NameDirectory {
  private readonly cache: NameCache = readCache();
  /** Hashes Bungie has no name for, so they are not asked for again. */
  private readonly hashesWithoutName = new Set<string>();
  /** Item hashes to name beyond what the panel shows (used by the debug export). */
  private readonly extraItemHashes = new Set<number>();
  /** Name downloads wait in line here, so two of them never run at once. */
  private downloadQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: NameDirectoryDependencies) {}

  // ---- reading names ------------------------------------------------------

  perkName(perkHash: number): string {
    return this.cache.items[perkHash] ?? `Perk ${perkHash}`;
  }

  artifactName(artifactHash: number): string {
    return this.cache.items[artifactHash] ?? 'Artifact';
  }

  /** The name of an item, or undefined if it is not known yet. */
  itemNameOrUndefined(itemHash: number): string | undefined {
    return this.cache.items[itemHash];
  }

  /** "Slot 3 · Strand": the slot number the player sees, plus the loadout's name when known. */
  slotLabel(slotIndex: number, nameHash: number): string {
    const loadoutName = this.cache.loadouts[nameHash];
    return `Slot ${slotIndex + 1}${loadoutName ? ` · ${loadoutName}` : ''}`;
  }

  /** Several slot labels in a row: "Slot 1 · Void, Slot 3 · Strand". */
  slotNames(slotRefs: SlotRef[]): string {
    return slotRefs.map((slotRef) => this.slotLabel(slotRef.index, slotRef.nameHash)).join(', ');
  }

  get loadoutNames(): Record<number, string> {
    return this.cache.loadouts;
  }

  // ---- downloading names --------------------------------------------------

  /** Asks for names of items that the panel does not show, such as those in the debug export. */
  includeExtraItemHashes(itemHashes: Iterable<number>): void {
    for (const itemHash of itemHashes) this.extraItemHashes.add(itemHash);
  }

  /** Downloads any names still missing. Calls wait their turn, so none overlap. */
  loadMissingNames(): Promise<void> {
    this.downloadQueue = this.downloadQueue.then(() => this.downloadMissingNames());
    return this.downloadQueue;
  }

  private findMissingHashes(): { itemHashes: number[]; nameHashes: number[] } {
    const { analysis } = this.dependencies.state;
    if (!analysis) return { itemHashes: [], nameHashes: [] };

    const needed = neededHashes(analysis);
    return {
      itemHashes: [...needed.items, ...this.extraItemHashes].filter(
        (itemHash) => !this.cache.items[itemHash] && !this.hashesWithoutName.has(`item:${itemHash}`),
      ),
      nameHashes: [...needed.loadoutNames].filter(
        (nameHash) => !this.cache.loadouts[nameHash] && !this.hashesWithoutName.has(`loadout:${nameHash}`),
      ),
    };
  }

  private async downloadMissingNames(): Promise<void> {
    const paths = this.dependencies.state.paths;
    if (!paths) return;

    const missing = this.findMissingHashes();
    if (missing.itemHashes.length === 0 && missing.nameHashes.length === 0) return;

    const downloads: Promise<void>[] = [];

    const itemTablePath = paths.DestinyInventoryItemLiteDefinition ?? paths.DestinyInventoryItemDefinition;
    if (missing.itemHashes.length > 0 && itemTablePath) {
      downloads.push(
        this.downloadTable<{ displayProperties?: { name?: string } }>(itemTablePath).then((itemDefinitions) => {
          for (const itemHash of missing.itemHashes) {
            const name = itemDefinitions[itemHash]?.displayProperties?.name;
            if (name) this.cache.items[itemHash] = name;
            else this.hashesWithoutName.add(`item:${itemHash}`);
          }
        }),
      );
    }

    const loadoutNameTablePath = paths.DestinyLoadoutNameDefinition;
    if (missing.nameHashes.length > 0 && loadoutNameTablePath) {
      downloads.push(
        this.downloadTable<{ name?: string }>(loadoutNameTablePath).then((loadoutNameDefinitions) => {
          for (const nameHash of missing.nameHashes) {
            const name = loadoutNameDefinitions[nameHash]?.name;
            if (name) this.cache.loadouts[nameHash] = name;
            else this.hashesWithoutName.add(`loadout:${nameHash}`);
          }
        }),
      );
    }

    const results = await Promise.allSettled(downloads);
    for (const result of results) {
      if (result.status === 'rejected') console.warn(LOG_TAG, 'could not load names', result.reason);
    }
    writeCache(this.cache);
    this.dependencies.onNamesLoaded();
  }

  private async downloadTable<Definition>(path: string): Promise<Record<number, Definition | undefined>> {
    const response = await this.dependencies.originalFetch(`https://www.bungie.net${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

function readCache(): NameCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(NAME_CACHE_KEY) ?? 'null') as NameCache | null;
    if (parsed?.items && parsed.loadouts) return parsed;
  } catch {
    /* corrupt or unavailable: start empty */
  }
  return { items: {}, loadouts: {} };
}

function writeCache(cache: NameCache): void {
  try {
    localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: names are downloaded again next time */
  }
}
