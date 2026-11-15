/*
 * The "Export debug file" button: saves the raw artifact data behind the panel
 * as a JSON file the player can send along when something looks wrong.
 */
import { ARTIFACT_BUCKET_HASH, UNSET_PLUG_HASH, debugItemHashes } from '../analysis';
import type { AppContext } from './context';
import { DEBUG_FILE_NAME } from './constants';

/** The browser needs a moment to start the download before the file's address is released. */
const MILLISECONDS_BEFORE_FILE_URL_IS_RELEASED = 10_000;

/**
 * Saves a JSON file with what each saved slot holds, what is on each artifact
 * now, and which perks each position accepts. It contains no account,
 * character or item ids.
 */
export async function exportDebugFile(context: AppContext): Promise<void> {
  const { state, names } = context;
  const snapshot = state.debug;
  if (!snapshot) return;

  // The panel only names what it shows; the file names everything in the snapshot.
  names.includeExtraItemHashes(debugItemHashes(snapshot));
  await names.loadMissingNames();

  const itemNames: Record<number, string> = {};
  for (const itemHash of debugItemHashes(snapshot)) {
    const name = names.itemNameOrUndefined(itemHash);
    if (name) itemNames[itemHash] = name;
  }

  const report = {
    tool: 'dim-artifact-slot-check',
    exportedAt: new Date().toISOString(),
    dataFrom: state.updatedAt?.toISOString() ?? null,
    host: location.host,
    language: document.documentElement.lang || null,
    namesAvailable: Boolean(state.paths),
    constants: { unsetPlugHash: UNSET_PLUG_HASH, artifactBucketHash: ARTIFACT_BUCKET_HASH },
    snapshot,
    // Character ids are dropped; class and slots are enough to troubleshoot.
    analysis: state.analysis?.characters.map(({ characterId: _omittedId, ...characterWithoutId }) => characterWithoutId) ?? null,
    itemNames,
    loadoutNames: names.loadoutNames,
  };

  saveAsDownload(JSON.stringify(report, null, 2), DEBUG_FILE_NAME);
}

/** Makes the browser save `text` as a file, the same way a download link would. */
function saveAsDownload(text: string, fileName: string): void {
  const fileUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(fileUrl), MILLISECONDS_BEFORE_FILE_URL_IS_RELEASED);
}
