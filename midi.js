/* ═══════════════════════════════════════════
   SONG PLAYER
   parseMidi() and compactTimings() live in parser.js (loaded first).
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

const MAX_MIDI_BYTES = 5 * 1024 * 1024; // real MIDI files are rarely over a few hundred KB

function loadSong(file) {
  loadErr('');
  if (file.size > MAX_MIDI_BYTES) {
    loadErr(`File too large (${(file.size / 1048576).toFixed(1)} MB) — MIDI files should be well under 5 MB.`);
    return;
  }
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
