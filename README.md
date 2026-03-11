# Mallet

A browser-based mallet percussion instrument simulator.

## What is Mallet?

Mallet is a self-contained, browser-based instrument simulator that lets you play pitched percussion instruments in your web browser using your keyboard, mouse, or touch screen. No installation required — just open `index.html`.

Supported instruments:
- Glockenspiel
- Xylophone
- Marimba
- Vibraphone

## Features

- **3 octaves**: G4–C7 (18 natural notes + 12 sharps = 30 notes total)
- **Keyboard playable**: full keyboard layout for natural notes and sharps
- **Click or tap to play**: works with mouse and touch screens
- **MIDI file support**: load `.mid`/`.midi` files to listen or practice with visual note cues
- **Vibraphone motor tremolo**: authentic ~5.4 Hz tremolo effect; spacebar acts as sustain pedal
- **Playback speed control**: 25–200% speed; optional silence compression
- **Web Audio API**: sine oscillators with harmonic partials for each instrument
- **Self-contained**: single `index.html` file, no dependencies or build step

## Keyboard Layout

### Natural Notes

| Key | Note |
|-----|------|
| Z | G4 |
| X | A4 |
| C | B4 |
| V | C5 |
| B | D5 |
| N | E5 |
| M | F5 |
| , | G5 |
| . | A5 |
| / | B5 |
| Q | C6 |
| W | D6 |
| E | E6 |
| R | F6 |
| T | G6 |
| Y | A6 |
| U | B6 |
| I | C7 |

### Sharps

| Key | Note |
|-----|------|
| S | G#4/Ab4 |
| D | A#4/Bb4 |
| G | C#5/Db5 |
| H | D#5/Eb5 |
| K | F#5/Gb5 |
| L | G#5/Ab5 |
| ; | A#5/Bb5 |
| 2 | C#6/Db6 |
| 3 | D#6/Eb6 |
| 5 | F#6/Gb6 |
| 6 | G#6/Ab6 |
| 7 | A#6/Bb6 |

### Vibraphone Controls

- **Spacebar**: sustain pedal (hold to sustain notes, release to damp)

## MIDI Usage

1. Open `index.html` in a modern web browser
2. Select your instrument from the dropdown
3. Click **Load MIDI** and choose a `.mid` or `.midi` file
4. Use the **Play/Pause** button to start playback
5. Adjust **playback speed** (25–200%) with the speed slider
6. Enable **silence compression** to skip long rests during practice

While a MIDI file plays, the corresponding keys light up on screen, making it easy to follow along and practice.

## Usage

Simply open `index.html` in any modern browser. No server required.

## Browser Compatibility

Requires a browser with Web Audio API support (Chrome, Firefox, Safari, Edge — all modern versions).

