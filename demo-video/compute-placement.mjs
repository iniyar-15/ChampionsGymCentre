import fs from 'fs';
import path from 'path';

const dir = import.meta.dirname;
const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf-8'));
const durations = JSON.parse(fs.readFileSync(path.join(dir, 'audio-durations.json'), 'utf-8'));

const sceneStart = Object.fromEntries(timeline.map(t => [t.scene, t.t]));
const videoEnd = sceneStart['end'];
const GAP = 300;

let cursor = 0;
const placement = durations.map(({ scene, durationMs }) => {
  const start = Math.max(sceneStart[scene], cursor);
  const end = start + durationMs;
  cursor = end + GAP;
  return { scene, start, durationMs, end };
});

const lastEnd = placement[placement.length - 1].end + GAP;
const freezeExtensionMs = Math.max(0, lastEnd - videoEnd);
const finalVideoMs = videoEnd + freezeExtensionMs;

const result = { videoEndMs: videoEnd, placement, lastEnd, freezeExtensionMs, finalVideoMs };
fs.writeFileSync(path.join(dir, 'placement.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
