# Acoustics & Music Theory Notes

This document explains the physical and musical principles behind the synthesis in this app. Most of it comes from research into how real percussion instruments actually work.

---

## Why Percussion Instruments Sound the Way They Do

The core difference between a piano (string) and a glockenspiel (metal bar) is **harmonicity** — how the overtones relate to the fundamental frequency.

A vibrating **string** produces overtones at exact integer multiples of the fundamental: 2×, 3×, 4×, 5×... These are called *harmonics*, and because they all fit neatly together, strings sound smooth and musical.

A vibrating **free bar** (not clamped at the ends) produces overtones governed by the Euler-Bernoulli beam equation, which gives ratios of approximately **1×, 2.76×, 5.40×, 8.93×, 13.34×**. These are *inharmonic* — they don't form simple integer relationships. This is exactly what gives the glockenspiel and vibraphone their characteristic shimmer and bell-like quality.

The ratios come from the zeros of a transcendental equation involving hyperbolic and trigonometric functions. The 2.756 ratio in particular is a signature of free-free boundary conditions and shows up reliably in measurements of real glockenspiel bars (Rossing, 1976).

---

## Glockenspiel

Steel bars, mounted at the two nodal points of the fundamental mode (approximately 22.4% from each end — the points that don't move). The mounting pins go exactly there so they don't damp the vibration.

Partials used in the synthesis:

| Partial | Ratio | Origin |
|---------|-------|--------|
| 1st (fundamental) | 1.000 | — |
| 2nd | 2.756 | Euler-Bernoulli free bar |
| 3rd | 5.404 | " |
| 4th | 8.933 | " |
| 5th | 13.34 | " |

The 2.756× ratio is roughly an octave and a tritone above the fundamental (~1755 cents). This inharmonic spacing is what makes glockenspiels sound "shimmery" rather than "pure" — if the overtones were at 2×, 3× etc. it would sound more like a flute.

Higher partials decay much faster than the fundamental, which is why the initial attack sounds bright and the sustain sounds warmer.

---

## Marimba vs Xylophone: Arch Tuning

The most important acoustic difference between marimba and xylophone is what happens to the **first overtone**:

- **Marimba**: the underside of each bar is carved into a deep arch. This selectively lowers the fundamental frequency while keeping the first overtone high. The result is a first overtone at exactly **4×** the fundamental (two octaves up). This is a deliberate design choice — two octaves is a musically "pure" interval that reinforces the fundamental without clashing. A weaker partial at roughly **10×** (about an octave and a major third above the 4×) is also present and adds brightness to the attack.

- **Xylophone**: less aggressive arch, denser/harder wood (Honduras rosewood or synthetic). Adams offers two tuning variants: **"Quint" tuning** with the first overtone at **3×** the fundamental (an octave plus a fifth — a twelfth), and **"Octave" tuning** at **4×** (two octaves, like marimba). Quint tuning is the brighter, more traditional xylophone sound and the standard for orchestral use. Either way, xylophone sounds brighter and more penetrating than marimba due to the harder bars and mallets.

The arch tuning is done by a skilled craftsperson iteratively — they carve a little, measure the partial ratio, carve a little more. Bass marimba bars can be up to 10 cm wide and over 60 cm long, but start from blanks only about 2.5–4 cm thick before the deep arch is carved into the underside.

### Why Marimba Goes Lower

A large concert marimba can reach as low as A2 (about 55 Hz) — some 5-octave models extend to C2 — while a concert glockenspiel's lowest note is around C5. The arch tuning is what makes this low range possible — without it, a bar long enough to produce those low frequencies would have its first overtone at an inharmonic position that would sound ugly. The arch brings the overtone back to 4×, making even very low notes musical.

---

## Vibraphone

Vibraphone bars are **aluminum** (not steel like glockenspiel), arch-tuned like marimba to place the first overtone at **4×**. Aluminum has lower internal damping than steel, which is why vibraphone notes sustain so much longer.

### The Tremolo Motor

A real vibraphone has a row of resonator tubes under the bars. At the top of each tube is a rotating fan (also called a disc) driven by an electric motor. The rotation speed is adjustable — the Adams Alpha specifies 40–140 RPM, though other manufacturers may differ. When a fan is open, the resonator amplifies the bar's sound. When it's closed, it dampens it. This creates the characteristic tremolo (amplitude modulation at the motor's rotation frequency).

Crucially, **all fans are phase-locked** — they are connected to the motor via timing belts so they all rotate together. This means every note you play shares the same tremolo cycle. If you play a chord, all the notes swell and fade together, which is part of what gives vibraphone chords their lush, unified sound.

This app models that with a single global LFO rather than creating a new oscillator per note.

### The Sustain Pedal

Like a piano, a vibraphone has a sustain pedal — but the mechanism is different. A long, spring-loaded felt-covered bar (the "dampener bar") rests against all the tone bars by default, instantly muting them. Pushing the foot pedal down pulls this dampener bar away, allowing the bars to ring freely. The spacebar in this app simulates this.

---

## Why Wood Sounds Different from Metal

The timbre difference between marimba (wood) and glockenspiel (metal) comes down to two properties:

1. **Internal damping**: wood has much higher internal damping than metal. Vibrations die out faster, especially in the upper partials. This is why marimba has a warm, round sound with a fast decay on the brightness, while glockenspiel rings clearly for several seconds.

2. **Mallet hardness**: glockenspiel is struck with hard plastic or rubber mallets, injecting a broad spectrum of frequencies. Marimba uses yarn-wrapped mallets, which are soft. A soft mallet can't excite very high frequencies — it's in contact with the bar for a longer time, effectively acting as a low-pass filter on the attack. This is modeled in the synthesis by using bandpass-filtered noise centered *below* the note frequency for marimba, versus at the note frequency for xylophone.

---

## Additive Synthesis

All four instruments use **additive synthesis**: multiple sine wave oscillators are added together, each representing one partial. This is the simplest and most direct way to model a pitched percussion instrument — real instruments also produce a small number of dominant partials.

The main limitation is that we're not modeling the full resonant body of the instrument, just the spectral content. A convolution reverb impulse response (generated procedurally from exponential noise decay) adds some room character back.

---

## References

- Rossing, T.D. (1976). [Acoustics of percussion instruments — Part I](https://pubs.aip.org/aapt/pte/article-abstract/14/9/546/266582). *The Physics Teacher*, 14(9), 546–556.
- Rossing, T.D. (2000). [*Science of Percussion Instruments*](https://www.amazon.com/Science-Percussion-Instruments-Popular/dp/9810241585). World Scientific.
- Rossing, T.D., Moore, F.R. & Wheeler, P.A. (2001). [*The Science of Sound* (3rd ed.)](https://www.amazon.com/Science-Sound-3rd-Thomas-Rossing/dp/0805385657). Addison-Wesley.
- Fletcher, N.H. & Rossing, T.D. (1998). [*The Physics of Musical Instruments* (2nd ed.)](https://link.springer.com/book/10.1007/978-0-387-21603-4). Springer.
- Adams Musical Instruments. [*Percussion Instrument Manuals*](https://www.adams-music.com/en/support/percussion) (Alpha Vibraphone, Concert/Solist Marimba & Xylophone, Artist/Concert Glockenspiel). Adams Musical Instruments B.V., Thorn, Netherlands.
