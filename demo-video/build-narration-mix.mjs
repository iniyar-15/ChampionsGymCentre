import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const dir = import.meta.dirname;
const placement = JSON.parse(fs.readFileSync(path.join(dir, 'placement.json'), 'utf-8'));
const ffmpeg = path.join(dir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

const FINAL_VIDEO_S = 164.236;

const inputs = [];
const filterLines = [];
placement.placement.forEach((p, i) => {
  inputs.push('-i', path.join(dir, 'audio', `${p.scene}.wav`));
  filterLines.push(`[${i}:a]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo,adelay=delays=${p.start}|${p.start}[a${i}]`);
});

const n = placement.placement.length;
const mixInputs = Array.from({ length: n }, (_, i) => `[a${i}]`).join('');
filterLines.push(`${mixInputs}amix=inputs=${n}:duration=longest:normalize=0[mixed]`);
filterLines.push(`[mixed]apad,atrim=0:${FINAL_VIDEO_S}[out]`);

const filterScriptPath = path.join(dir, 'narration-filter.txt');
fs.writeFileSync(filterScriptPath, filterLines.join(';\n'));

const args = [
  '-y',
  ...inputs,
  '-filter_complex_script', filterScriptPath,
  '-map', '[out]',
  path.join(dir, 'audio', 'narration-mix.wav'),
];

console.log('Running ffmpeg with', n, 'inputs...');
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('Done: audio/narration-mix.wav');
