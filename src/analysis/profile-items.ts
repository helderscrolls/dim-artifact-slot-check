import type { ItemComponent, ProfileResponse } from '../bungie-types';

/**
 * Bungie's profile lists items in several places: the vault, and each
 * character's inventory and equipment. This gathers them all into one lookup
 * table, keyed by item instance id, so the rest of the code can find any item
 * with a single `get`.
 */
export function indexItemsByInstanceId(profile: ProfileResponse): Map<string, ItemComponent> {
  const itemsByInstanceId = new Map<string, ItemComponent>();

  const addItems = (items: ItemComponent[] = []) => {
    for (const item of items) {
      if (item.itemInstanceId) itemsByInstanceId.set(item.itemInstanceId, item);
    }
  };

  addItems(profile.profileInventory?.data?.items);
  for (const component of [profile.characterInventories, profile.characterEquipment]) {
    for (const inventory of Object.values(component?.data ?? {})) {
      addItems(inventory.items);
    }
  }
  return itemsByInstanceId;
}
