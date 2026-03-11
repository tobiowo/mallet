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
  } catch(e) { return null; }
}

/* ═══════════════════════════════════════════
   SONG PLAYER
   Depends on globals from index.html:
     BAR_LO, BAR_HI  — bar range constants
     midi2el          — midi pitch → bar DOM element
     ding(midi)       — play a note
     flash(el)        — flash a bar
     onNotePlayed     — callback hook (reassigned here)
     boot()           — initialise AudioContext
═══════════════════════════════════════════ */
let rawAll        = null;  // [{time, pitch, track}] all parsed notes
let activeTracks  = new Set();
let song          = null;  // rawAll filtered by activeTracks
let inRange       = null;  // subset of song within G4–C7 bar range
let songMode      = null;  // 'listen' | 'practice'
let songTimers    = [];
let practiceGroups = [];   // notes grouped into chords by proximity in time
let practiceIdx   = 0;

// Cached DOM references
const elSongStatus  = document.getElementById('songStatus');
const elLoadError   = document.getElementById('loadError');
const elBtnListen   = document.getElementById('btnListen');
const elBtnPractice = document.getElementById('btnPractice');
const elBtnStop     = document.getElementById('btnStop');
const elBtnCompact  = document.getElementById('btnCompact');
const elBtnAllNotes = document.getElementById('btnAllNotes');
const elTrackRow    = document.getElementById('trackRow');
const elDropZone    = document.getElementById('dropZone');
const elSongLoaded  = document.getElementById('songLoaded');
const elTempoSlider = document.getElementById('tempoSlider');

const setStatus = text => { elSongStatus.textContent = text; };
const loadErr   = text => { elLoadError.textContent = text; };

const cuedBars = new Set(); // track cued elements to avoid querySelectorAll

function clearCues() {
  cuedBars.forEach(b => b.classList.remove('cue'));
  cuedBars.clear();
}

function stopSong() {
  songTimers.forEach(clearTimeout);
  songTimers = [];
  songMode = null;
  clearCues();
  elBtnListen.classList.remove('active');
  elBtnPractice.classList.remove('active');
  elBtnStop.disabled = true;
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

function applyTrackFilter() {
  song    = rawAll.filter(e => activeTracks.has(e.track));
  inRange = song.filter(e => e.pitch >= BAR_LO && e.pitch <= BAR_HI);

  practiceGroups = [];
  let grp = null;
  for (const e of inRange) {
    if (!grp || e.time - grp[0].time >= 0.06) { if (grp) practiceGroups.push(grp); grp = [e]; }
    else grp.push(e);
  }
  if (grp) practiceGroups.push(grp);

  const skipped = song.length - inRange.length;
  setStatus(`${inRange.length} / ${song.length} notes in range${skipped ? ` · ${skipped} out-of-range` : ''}`);
}

function loadSong(file) {
  loadErr('');
  file.arrayBuffer().then(ab => {
    const all = parseMidi(ab);
    if (!all) { loadErr('Could not parse MIDI file.'); return; }

    const anyInRange = all.some(e => e.pitch >= BAR_LO && e.pitch <= BAR_HI);
    if (!anyInRange) { loadErr(`No notes in range G4–C7 (${all.length} total notes all out of range).`); return; }

    rawAll = all;
    const trackNums  = [...new Set(all.map(e => e.track))].sort((a, b) => a - b);
    const trackNames = all.trackNames || [];
    activeTracks = new Set(trackNums);

    // Build track selector buttons (only when >1 track)
    elTrackRow.innerHTML = '';
    if (trackNums.length > 1) {
      const lbl = document.createElement('span');
      lbl.textContent = 'Tracks';
      elTrackRow.appendChild(lbl);
      trackNums.forEach(t => {
        const count = all.filter(e => e.track === t).length;
        const btn = document.createElement('button');
        btn.className = 'song-btn active';
        const name = trackNames[t];
        btn.textContent = `T${t + 1}`;
        btn.title = (name ? name + ' · ' : '') + `${count} notes`;
        btn.addEventListener('click', () => {
          if (activeTracks.has(t)) activeTracks.delete(t); else activeTracks.add(t);
          btn.classList.toggle('active', activeTracks.has(t));
          stopSong();
          applyTrackFilter();
        });
        elTrackRow.appendChild(btn);
      });
      elTrackRow.style.display = '';
    } else {
      elTrackRow.style.display = 'none';
    }

    document.getElementById('songName').textContent = file.name.replace(/\.(mid|midi)$/i, '');
    applyTrackFilter();
    elDropZone.style.display = 'none';
    elSongLoaded.classList.add('active');
  });
}

function startSong(mode) {
  stopSong();
  boot();
  songMode = mode;
  (mode === 'listen' ? elBtnListen : elBtnPractice).classList.add('active');
  elBtnStop.disabled = false;
}

function startListen() {
  startSong('listen');
  setStatus('Playing…');

  const speed    = +elTempoSlider.value / 100;
  const compact  = elBtnCompact.classList.contains('active');
  const allNotes = elBtnAllNotes.classList.contains('active');
  const base     = allNotes ? song : inRange;
  const events   = compact ? compactTimings(base) : base;

  events.forEach(e => {
    const tid = setTimeout(() => {
      ding(e.pitch);
      const el = midi2el[e.pitch];
      if (el) flash(el);
    }, e.time / speed * 1000);
    songTimers.push(tid);
  });

  // Auto-reset when done
  const end = events[events.length - 1].time;
  songTimers.push(setTimeout(() => { stopSong(); setStatus('Done.'); }, end / speed * 1000 + 800));
}

function startPractice() {
  startSong('practice');
  practiceIdx = 0;
  cuePractice();
}

function cuePractice() {
  clearCues();
  if (practiceIdx >= practiceGroups.length) {
    setStatus('Complete! ✓');
    stopSong();
    return;
  }
  const grp = practiceGroups[practiceIdx];
  grp.forEach(e => { const el = midi2el[e.pitch]; if (el) { el.classList.add('cue'); cuedBars.add(el); } });
  setStatus(`Note ${practiceIdx + 1} / ${practiceGroups.length}`);
}

// Hooked into ding() — advance practice on correct note
onNotePlayed = midi => {
  if (songMode !== 'practice') return;
  const grp = practiceGroups[practiceIdx];
  if (grp && grp.some(e => e.pitch === midi)) {
    practiceIdx++;
    setTimeout(cuePractice, 80); // brief pause so flash and cue don't overlap
  }
};

// ── File drop / browse ──
elDropZone.addEventListener('dragover', e => { e.preventDefault(); elDropZone.classList.add('over'); });
elDropZone.addEventListener('dragleave', ()  => elDropZone.classList.remove('over'));
elDropZone.addEventListener('drop', e => {
  e.preventDefault();
  elDropZone.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) loadSong(file);
});
document.getElementById('midiInput').addEventListener('change', e => {
  if (e.target.files[0]) loadSong(e.target.files[0]);
});

// ── Song control buttons ──
elBtnListen.addEventListener('click',   startListen);
elBtnPractice.addEventListener('click', startPractice);
elBtnStop.addEventListener('click',     stopSong);
document.getElementById('btnClear').addEventListener('click', () => {
  stopSong();
  rawAll = null; song = null; inRange = null;
  activeTracks = new Set();
  elTrackRow.style.display = 'none';
  elSongLoaded.classList.remove('active');
  elDropZone.style.display = '';
  setStatus('');
});

// ── Tempo slider ──
elTempoSlider.addEventListener('input', e => {
  document.getElementById('tempoVal').textContent = e.target.value + '%';
});

// ── Compact / All notes toggles ──
elBtnCompact.addEventListener('click', function() { this.classList.toggle('active'); });
elBtnAllNotes.addEventListener('click', function() { this.classList.toggle('active'); });
