import fs from 'fs';
import path from 'path';

const audioDir = path.join(import.meta.dirname, 'audio');
const narration = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'narration.json'), 'utf-8'));

function wavDurationMs(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 12; // skip RIFF header
  let sampleRate = 0, bitsPerSample = 0, channels = 0, dataSize = 0;
  while (offset < buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  return Math.round((dataSize / bytesPerSecond) * 1000);
}

const durations = narration.map(({ scene }) => {
  const filePath = path.join(audioDir, `${scene}.wav`);
  return { scene, durationMs: wavDurationMs(filePath) };
});

fs.writeFileSync(path.join(import.meta.dirname, 'audio-durations.json'), JSON.stringify(durations, null, 2));
console.log(durations);
console.log('Total speech ms:', durations.reduce((s, d) => s + d.durationMs, 0));
