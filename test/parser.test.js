const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMidi, compactTimings } = require('../parser.js');

/* ── byte-builder helpers ── */
const str = s => [...s].map(c => c.charCodeAt(0));
const u16 = n => [(n >>> 8) & 0xff, n & 0xff];
const u32 = n => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const vlq = n => { // variable-length quantity
  const out = [n & 0x7f];
  while ((n >>>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};

// tracks: array of per-track event byte arrays (each already delta-prefixed)
function midiFile(tracks, { format = tracks.length > 1 ? 1 : 0, division = 480 } = {}) {
  const bytes = [...str('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(division)];
  for (const ev of tracks) bytes.push(...str('MTrk'), ...u32(ev.length), ...ev);
  return new Uint8Array(bytes).buffer;
}

const noteOn  = (delta, pitch, vel = 64, ch = 0) => [...vlq(delta), 0x90 | ch, pitch, vel];
const noteOff = (delta, pitch, ch = 0)           => [...vlq(delta), 0x80 | ch, pitch, 0];
const meta    = (delta, type, data)              => [...vlq(delta), 0xff, type, ...vlq(data.length), ...data];
const tempo   = (delta, uspq)                    => meta(delta, 0x51, [(uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff]);

/* ── invalid input ── */

test('returns null for empty buffer', () => {
  assert.equal(parseMidi(new ArrayBuffer(0)), null);
});

test('returns null for garbage bytes', () => {
  assert.equal(parseMidi(new Uint8Array([1, 2, 3, 4, 5]).buffer), null);
});

test('returns null for wrong magic number', () => {
  const ab = midiFile([[...noteOn(0, 60), ...noteOff(480, 60)]]);
  new Uint8Array(ab)[0] = 0x58; // corrupt 'MThd'
  assert.equal(parseMidi(ab), null);
});

test('returns null for file truncated mid-track', () => {
  const ab = midiFile([[...noteOn(0, 60), ...noteOff(480, 60)]]);
  assert.equal(parseMidi(ab.slice(0, ab.byteLength - 3)), null);
});

/* ── basic parsing ── */

test('format-0 file: pitches and seconds at default 120 BPM', () => {
  // 480 ticks/quarter at 500000 µs/quarter → 480 ticks = 0.5 s
  const ab = midiFile([[
    ...noteOn(0, 60), ...noteOff(480, 60),
    ...noteOn(0, 62), ...noteOff(480, 62),
  ]]);
  const ev = parseMidi(ab);
  assert.deepEqual(ev.map(e => [e.pitch, e.time, e.track]), [[60, 0, 0], [62, 0.5, 0]]);
});

test('note-on with velocity 0 acts as note-off', () => {
  const ab = midiFile([[...noteOn(0, 60), ...noteOn(480, 60, 0)]]);
  const ev = parseMidi(ab);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].pitch, 60);
});

test('running status: status byte omitted on repeated events', () => {
  const ab = midiFile([[
    ...noteOn(0, 60),
    ...vlq(0), 64, 64,        // running-status note-on, pitch 64
    ...noteOff(480, 60),
    ...vlq(0), 64, 0,         // running-status note-off (0x80 carried over)
  ]]);
  const ev = parseMidi(ab);
  assert.deepEqual(ev.map(e => e.pitch).sort((a, b) => a - b), [60, 64]);
  assert.ok(ev.every(e => e.time === 0));
});

test('channel-10 drum events are skipped', () => {
  const ab = midiFile([[
    ...noteOn(0, 36, 100, 9), ...noteOff(480, 36, 9), // drums
    ...noteOn(0, 60),         ...noteOff(480, 60),     // melodic
  ]]);
  const ev = parseMidi(ab);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].pitch, 60);
});

test('unmatched note-on is flushed at track end', () => {
  const ab = midiFile([[...noteOn(480, 72)]]); // no note-off
  const ev = parseMidi(ab);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].pitch, 72);
  assert.equal(ev[0].time, 0.5);
});

/* ── tempo map ── */

test('initial tempo meta overrides the 120 BPM default', () => {
  const ab = midiFile([[
    ...tempo(0, 1000000), // 60 BPM → 480 ticks = 1 s
    ...noteOn(480, 60), ...noteOff(480, 60),
  ]]);
  const ev = parseMidi(ab);
  assert.equal(ev[0].time, 1);
});

test('mid-song tempo change applies only after its tick', () => {
  const ab = midiFile([[
    ...noteOn(0, 60), ...noteOff(480, 60),  // 0–480 at 120 BPM
    ...tempo(0, 250000),                     // 240 BPM from tick 480
    ...noteOn(480, 62), ...noteOff(480, 62), // note-on at tick 960
  ]]);
  const ev = parseMidi(ab);
  assert.equal(ev[0].time, 0);
  assert.equal(ev[1].time, 0.5 + 480 * 250000 / (1e6 * 480)); // 0.75
});

/* ── multi-track ── */

test('format-1 file: track indices and piggybacked trackNames', () => {
  const ab = midiFile([
    [...meta(0, 0x03, str('Lead')), ...noteOn(0, 60), ...noteOff(480, 60)],
    [...meta(0, 0x03, str('Bass')), ...noteOn(480, 48), ...noteOff(480, 48)],
  ]);
  const ev = parseMidi(ab);
  assert.deepEqual(ev.trackNames, ['Lead', 'Bass']);
  assert.deepEqual(ev.map(e => [e.pitch, e.track]), [[60, 0], [48, 1]]);
});

/* ── compactTimings ── */

test('compactTimings clamps long gaps but preserves phrase rhythm', () => {
  const events = [0, 0.5, 5, 5.25].map(time => ({ time, pitch: 60, track: 0 }));
  assert.deepEqual(compactTimings(events).map(e => e.time), [0, 0.5, 1.5, 1.75]);
});

test('compactTimings leaves gaps at or under maxGap untouched', () => {
  const events = [0, 1, 2].map(time => ({ time, pitch: 60, track: 0 }));
  assert.deepEqual(compactTimings(events).map(e => e.time), [0, 1, 2]);
});

test('compactTimings handles empty input', () => {
  assert.deepEqual(compactTimings([]), []);
});
