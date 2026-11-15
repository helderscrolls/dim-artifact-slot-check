// Re-runs the analysis on a debug export from the panel and prints the result.
// Usage: node test/check-export.mjs path/to/artifact-slot-check-debug.json
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const exportPath = process.argv[2];
if (!exportPath) {
  console.error('Usage: node test/check-export.mjs <debug-export.json>');
  process.exit(1);
}
const report = JSON.parse(await readFile(exportPath, 'utf8'));

// Compile the analysis code on the fly, so this script never uses a stale build.
const bundle = await build({ entryPoints: ['src/clash.ts'], bundle: true, format: 'esm', write: false });
const bundledCode = bundle.outputFiles[0].text;
const core = await import(`data:text/javascript;base64,${Buffer.from(bundledCode).toString('base64')}`);

// Rebuild the parts of Bungie's profile that the analysis reads, from the export.
const { artifacts, characters } = report.snapshot;
const profile = {
  characters: { data: {} },
  profileInventory: {
    data: {
      items: artifacts.map((artifact) => ({
        itemInstanceId: artifact.id,
        itemHash: artifact.itemHash,
        bucketHash: core.ARTIFACT_BUCKET_HASH,
      })),
    },
  },
  itemComponents: {
    sockets: {
      data: Object.fromEntries(
        artifacts
          .filter((artifact) => artifact.current)
          .map((artifact) => [
            artifact.id,
            { sockets: artifact.current.map((plugHash) => ({ plugHash })) },
          ]),
      ),
    },
  },
  characterLoadouts: { data: {} },
};

characters.forEach((character, characterNumber) => {
  const loadouts = [];
  for (const savedSlot of character.slots) {
    const artifactItem = { itemInstanceId: savedSlot.artifact, plugItemHashes: savedSlot.plugs };
    const otherItem = { itemInstanceId: 'other' };
    loadouts[savedSlot.slot] = {
      nameHash: savedSlot.nameHash,
      items: savedSlot.artifact ? [artifactItem] : [otherItem],
    };
  }
  // Slots that were empty in the export become empty loadouts, so slot numbers line up.
  for (let slotIndex = 0; slotIndex < loadouts.length; slotIndex++) {
    loadouts[slotIndex] ??= { nameHash: 0, items: [] };
  }
  profile.characters.data[`C${characterNumber}`] = { classType: character.classType };
  profile.characterLoadouts.data[`C${characterNumber}`] = { loadouts };
});

const perkName = (hash) => report.itemNames[hash] ?? `Perk ${hash}`;
const slotName = (slotRef) => `Slot ${slotRef.index + 1} ${report.loadoutNames[slotRef.nameHash] ?? ''}`.trim();
const CLASS_NAMES = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

const startTime = performance.now();
const analysis = core.analyze(profile);
const elapsedMilliseconds = performance.now() - startTime;

for (const character of analysis.characters) {
  if (character.slots.length === 0) continue;

  console.log(`\n== ${CLASS_NAMES[character.classType] ?? 'Character'} ==`);
  for (const slot of character.slots) {
    const brokenText = slot.brokenNow
      .map((brokenPerk) => `${perkName(brokenPerk.perkHash)} saved ${brokenPerk.saved} now ${brokenPerk.current}`)
      .join('; ');
    const suffix = brokenText ? ` (${brokenText})` : '';
    console.log(`${slotName(slot)} [${perkName(slot.artifactHash)}] ${slot.status}${suffix}`);
  }

  for (const plan of character.plans) {
    console.log(`\nSuggested fix: ${perkName(plan.artifactHash)}${plan.exhaustive ? '' : ' (search cut short)'}`);
    for (const change of plan.changes) {
      const moveText = change.moves
        .map((move) => `${perkName(move.perkHash)} ${move.from}->${move.to}`)
        .join(', ');
      console.log(`  ${slotName(change)}: ${moveText}`);
    }
    console.log(`  Already fine: ${plan.unchanged.map(slotName).join(', ') || 'none'}`);
    console.log(`  Can't fit: ${plan.excluded.map(slotName).join(', ') || 'none'}`);
  }
}
console.log(`\nAnalysis took ${elapsedMilliseconds.toFixed(1)} ms`);
