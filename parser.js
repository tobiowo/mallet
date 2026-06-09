/* ═══════════════════════════════════════════
   MIDI PARSER
   Handles format 0 & 1, multi-tempo, ignores drums (ch 10).
   Returns [{time: seconds, pitch: midiNumber, track: number}] sorted by time,
   with a .trackNames array piggybacked on the result.
═══════════════════════════════════════════ */
function parseMidi(ab) {
  try {
    const d = new DataView(ab);
    let p = 0;
    const r8  = () => d.getUint8(p++);
    const r16 = () => { const v = d.getUint16(p);  p += 2; return v; };
    const r32 = () => { const v = d.getUint32(p);  p += 4; return v; };
    const rVL = () => { let v = 0, b; do { b = r8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

    if (r32() !== 0x4d546864) return null; // 'MThd'
    r32();                    // chunk length (always 6)
    r16();                    // format (0 or 1 — handled identically)
    const nTracks = r16();
    const div     = r16();    // ticks per quarter note

    const tempos     = [{ tick: 0, uspq: 500000 }]; // default 120 BPM
    const raw        = [];                           // { tick, pitch, track }
    const trackNames = [];                           // track index → name string

    for (let t = 0; t < nTracks; t++) {
      if (p + 8 > ab.byteLength) break;
      if (r32() !== 0x4d54726b) break; // 'MTrk'
      const trackLen = r32(); const end = p + trackLen; // r32() must advance p before end is computed
      let tick = 0, status = 0, trackName = '';
      const on = {}; // pitch → startTick

      while (p < end) {
        tick += rVL();
        let b = r8();
        if      (b >= 0x80 && b < 0xf0) status = b;
        else if (b < 0x80)              { p--; b = status; } // running status

        const type = b & 0xf0, ch = b & 0x0f;

        if (type === 0x90 || type === 0x80) {
          const pitch = r8(), vel = r8();
          if (ch === 9) { /* drums — skip */ }
          else if (type === 0x90 && vel > 0) { on[pitch] = tick; }
          else if (on[pitch] != null)        { raw.push({ tick: on[pitch], pitch, track: t }); delete on[pitch]; }
        } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) { r8(); r8(); }
          else if (type === 0xc0 || type === 0xd0)                  { r8(); }
          else if (b === 0xf0 || b === 0xf7) { p += rVL(); status = 0; }
          else if (b === 0xff) {
            status = 0;
            const mt = r8(), ml = rVL();
            if (mt === 0x51 && ml === 3) tempos.push({ tick, uspq: (r8() << 16) | (r8() << 8) | r8() });
            else if (mt === 0x03) { // track name
              let s = ''; for (let i = 0; i < ml; i++) s += String.fromCharCode(r8());
              trackName = s.trim();
            } else p += ml;
          }
      }
      // flush any note-on with no matching note-off
      for (const [pit, st] of Object.entries(on)) raw.push({ tick: +st, pitch: +pit, track: t });
      trackNames[t] = trackName;
      p = end;
    }

    raw.sort((a, b) => a.tick - b.tick);
    tempos.sort((a, b) => a.tick - b.tick);

    // Convert ticks → seconds respecting all tempo changes
    function t2s(tick) {
      let s = 0, lt = 0, lu = 500000;
      for (const te of tempos) {
        if (te.tick >= tick) break;
        s += (te.tick - lt) * lu / (1e6 * div);
        lt = te.tick; lu = te.uspq;
      }
      return s + (tick - lt) * lu / (1e6 * div);
    }

    const events = raw.map(e => ({ time: t2s(e.tick), pitch: e.pitch, track: e.track }));
    events.trackNames = trackNames; // piggyback on the array
    return events;
  } catch(e) { console.warn('MIDI parse failed:', e); return null; }
}

// Compress silences longer than maxGap seconds, preserving rhythm within phrases
function compactTimings(events, maxGap = 1.0) {
  if (!events.length) return events;
  const out = [{ ...events[0], time: 0 }];
  let t = 0;
  for (let i = 1; i < events.length; i++) {
    t += Math.min(events[i].time - events[i - 1].time, maxGap);
    out.push({ ...events[i], time: t });
  }
  return out;
}

// Node export for tests; browsers load this as a plain script
if (typeof module !== 'undefined' && module.exports)
  module.exports = { parseMidi, compactTimings };
