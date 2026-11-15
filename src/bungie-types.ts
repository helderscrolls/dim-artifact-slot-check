/**
 * The parts of Bungie's GetProfile response this extension reads. Everything
 * is optional because the response depends on which components were requested
 * and on privacy settings.
 */

export interface ItemComponent {
  itemHash: number;
  itemInstanceId?: string;
  bucketHash: number;
}

interface InventoryComponent {
  items?: ItemComponent[];
}

export interface LoadoutItemComponent {
  itemInstanceId: string;
  /** One plug hash per socket index of the item. */
  plugItemHashes?: number[];
}

export interface LoadoutComponent {
  colorHash: number;
  iconHash: number;
  nameHash: number;
  items?: LoadoutItemComponent[];
}

interface SocketState {
  plugHash?: number;
}

export interface ReusablePlug {
  plugItemHash: number;
  canInsert: boolean;
  enabled: boolean;
}

export interface ProfileResponse {
  characters?: { data?: Record<string, { classType: number }> };
  profileInventory?: { data?: InventoryComponent };
  characterInventories?: { data?: Record<string, InventoryComponent> };
  characterEquipment?: { data?: Record<string, InventoryComponent> };
  characterLoadouts?: { data?: Record<string, { loadouts?: LoadoutComponent[] }> };
  itemComponents?: {
    sockets?: { data?: Record<string, { sockets?: SocketState[] }> };
    /** Per item, per socket index: the plugs that socket can hold. */
    reusablePlugs?: { data?: Record<string, { plugs?: Record<number, ReusablePlug[]> }> };
  };
}

/** Table name -> path of that table's JSON file on bungie.net. */
export type ManifestPaths = Record<string, string>;

export interface ManifestResponse {
  jsonWorldComponentContentPaths?: Record<string, ManifestPaths>;
}
