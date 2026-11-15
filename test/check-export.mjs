// Re-runs the analysis on a debug export from the panel and prints the result.
// Usage: node test/check-export.mjs path/to/artifact-slot-check-debug.json
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node test/check-export.mjs <debug-export.json>');
  process.exit(1);
}
const report = JSON.parse(await readFile(file, 'utf8'));

const bundle = await build({ entryPoints: ['src/clash.ts'], bundle: true, format: 'esm', write: false });
const core = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

// Rebuild the parts of Bungie's profile the analysis reads from the export.
const { artifacts, characters } = report.snapshot;
const profile = {
  characters: { data: {} },
  profileInventory: {
    data: {
      items: artifacts.map((a) => ({ itemInstanceId: a.id, itemHash: a.itemHash, bucketHash: core.ARTIFACT_BUCKET_HASH })),
    },
  },
  itemComponents: {
    sockets: {
      data: Object.fromEntries(
        artifacts.filter((a) => a.current).map((a) => [a.id, { sockets: a.current.map((plugHash) => ({ plugHash })) }]),
      ),
    },
  },
  characterLoadouts: { data: {} },
};
characters.forEach((character, i) => {
  const loadouts = [];
  for (const slot of character.slots) {
    loadouts[slot.slot] = {
      nameHash: slot.nameHash,
      items: slot.artifact ? [{ itemInstanceId: slot.artifact, plugItemHashes: slot.plugs }] : [{ itemInstanceId: 'other' }],
    };
  }
  for (let s = 0; s < loadouts.length; s++) loadouts[s] ??= { nameHash: 0, items: [] };
  profile.characters.data[`C${i}`] = { classType: character.classType };
  profile.characterLoadouts.data[`C${i}`] = { loadouts };
});

const perk = (hash) => report.itemNames[hash] ?? `Perk ${hash}`;
const slot = (ref) => `Slot ${ref.index + 1} ${report.loadoutNames[ref.nameHash] ?? ''}`.trim();
const CLASSES = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

const started = performance.now();
const analysis = core.analyze(profile);
const elapsed = performance.now() - started;

for (const character of analysis.characters) {
  if (!character.slots.length) continue;
  console.log(`\n== ${CLASSES[character.classType] ?? 'Character'} ==`);
  for (const s of character.slots) {
    const broken = s.brokenNow.map((p) => `${perk(p.perkHash)} saved ${p.saved} now ${p.current}`).join('; ');
    console.log(`${slot(s)} [${perk(s.artifactHash)}] ${s.status}${broken ? ` (${broken})` : ''}`);
  }
  for (const plan of character.plans) {
    console.log(`\nSuggested fix: ${perk(plan.artifactHash)}${plan.exhaustive ? '' : ' (search cut short)'}`);
    for (const change of plan.changes) {
      console.log(`  ${slot(change)}: ${change.moves.map((m) => `${perk(m.perkHash)} ${m.from}->${m.to}`).join(', ')}`);
    }
    console.log(`  Already fine: ${plan.unchanged.map(slot).join(', ') || 'none'}`);
    console.log(`  Can't fit: ${plan.excluded.map(slot).join(', ') || 'none'}`);
  }
}
console.log(`\nAnalysis took ${elapsed.toFixed(1)} ms`);
