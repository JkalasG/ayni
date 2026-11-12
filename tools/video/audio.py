"""
Music and sound effects for the Ayni video, synthesized from scratch with numpy (nothing from third parties,
so there is no copyright to clear). Usage:  python audio.py work/durations.json work

Writes  work/music.wav  and  work/sfx/<name>.wav
The music has two moods that follow the story: a sparse, minor one while Doña Rosa's problem is told, and a bright,
rhythmic one from the moment Ayni appears. It is meant to sit under a voice, so it stays soft.
"""
import json
import os
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def save(path, x, peak=0.9):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def t_arr(sec):
    return np.arange(int(sec * SR)) / SR


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a scalar or an array (Hz)."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def adsr_pad(n, attack, release):
    e = np.ones(n)
    a = int(attack * SR)
    r = int(release * SR)
    e[:a] = np.linspace(0, 1, a)
    e[-r:] = np.linspace(1, 0, r)
    return e


def place(buf, start_sec, sound):
    i = int(start_sec * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sound))
    buf[i:j] += sound[: j - i]


# ------------------------------------------------------------------------------------------------ notes
N = {
    "C2": 65.41, "F2": 87.31, "G2": 98.00, "A2": 110.00, "C3": 130.81, "E3": 164.81, "F3": 174.61, "G3": 196.00,
    "A3": 220.00, "B3": 246.94, "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00, "A4": 440.00,
    "B4": 493.88, "C5": 523.25, "D5": 587.33, "E5": 659.25, "G5": 783.99, "A5": 880.00, "C6": 1046.50, "E6": 1318.51,
}
# (root, chord tones) per chord; the sad section walks A minor, the bright one C major
SAD = [("A2", ["A3", "C4", "E4", "G4"]), ("F2", ["F3", "A3", "C4", "E4"]), ("C3", ["G3", "C4", "E4", "G4"]), ("G2", ["G3", "B3", "D4", "A4"])]
BRIGHT = [("C3", ["C4", "E4", "G4", "B4"]), ("G2", ["G3", "B3", "D4", "A4"]), ("A2", ["A3", "C4", "E4", "G4"]), ("F2", ["F3", "A3", "C4", "E4"])]

BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4


def pluck(freq, dur=0.9, amp=0.2, bright=0.5):
    t = t_arr(dur)
    env = np.exp(-t * 4.2) * np.minimum(1, t / 0.004)
    tone = np.sin(2 * np.pi * freq * t) + bright * 0.5 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 8) + 0.15 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 14)
    return tone * env * amp


def pad_chord(freqs, dur, amp=0.05):
    t = t_arr(dur)
    x = np.zeros_like(t)
    for f in freqs:
        for det in (-0.6, 0.0, 0.7):  # a slight detune makes it breathe
            x += np.sin(2 * np.pi * (f + det) * t) + 0.25 * np.sin(2 * np.pi * (f * 2 + det) * t)
    x = lowpass(x, 1400)
    return x / len(freqs) / 3 * adsr_pad(len(t), min(1.4, dur / 3), min(1.8, dur / 2)) * amp * 6


def bass_note(freq, dur, amp=0.22):
    t = t_arr(dur)
    env = np.minimum(1, t / 0.02) * np.exp(-t * 1.6)
    return (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)) * env * amp


def shaker(amp=0.05):
    n = int(0.07 * SR)
    x = highpass(rng.standard_normal(n), 5500)
    return x * np.exp(-t_arr(0.07) * 60) * amp


def soft_kick(amp=0.28):
    t = t_arr(0.28)
    f = 48 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * amp


def music(total, switch):
    buf = np.zeros(int((total + 3) * SR))
    # chords + bass + arpeggio, in bars
    bar = 0
    while bar * BAR < total + 1:
        start = bar * BAR
        sad = start < switch
        prog = SAD if sad else BRIGHT
        root, tones = prog[(bar // 2) % 4]
        if bar % 2 == 0:
            place(buf, start, pad_chord([N[x] for x in tones], BAR * 2 + 0.4, amp=0.05 if sad else 0.06))
        place(buf, start, bass_note(N[root], BAR * 0.95, amp=0.16 if sad else 0.2))
        if not sad:
            place(buf, start + BEAT * 2.5, bass_note(N[root], BEAT * 1.2, amp=0.10))
            for b in range(4):
                place(buf, start + b * BEAT, soft_kick(0.18 if b % 2 == 0 else 0.1))
        # arpeggio: sparse in the sad mood, running eighths in the bright one
        if sad:
            seq = [tones[0], tones[2], tones[1], tones[3]]
            for k in range(4):
                place(buf, start + k * BEAT, pluck(N[seq[k]] / (2 if k == 0 else 1), 1.6, 0.11, 0.3))
        else:
            seq = [tones[0], tones[1], tones[2], tones[3], tones[2], tones[1], tones[2], tones[3]]
            for k in range(8):
                f = N[seq[k]] * (2 if k in (3, 7) else 1)
                place(buf, start + k * BEAT / 2, pluck(f, 0.9, 0.12 if k % 2 == 0 else 0.07, 0.6))
                place(buf, start + k * BEAT / 2, shaker(0.05 if k % 2 else 0.03))
        bar += 1
    # fade in, and a long fade out
    n = len(buf)
    buf[: int(1.5 * SR)] *= np.linspace(0, 1, int(1.5 * SR))
    fade = int(4.0 * SR)
    end = int((total + 1.5) * SR)
    buf[end - fade : end] *= np.linspace(1, 0, fade)
    buf[end:] = 0
    return buf[: int((total + 2) * SR)]


# ------------------------------------------------------------------------------------------------ effects
def sfx_pop():
    t = t_arr(0.12)
    f = 700 + 900 * (t / 0.12)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * 0.8


def sfx_coin():
    t = t_arr(0.9)
    x = np.sin(2 * np.pi * 1568 * t) * np.exp(-t * 7) + 0.7 * np.sin(2 * np.pi * 2093 * t) * np.exp(-t * 6) * (t > 0.07)
    click = highpass(rng.standard_normal(len(t)), 4000) * np.exp(-t * 120) * 0.3
    return (x + click) * np.minimum(1, t / 0.003)


def sfx_whoosh(dur=0.9):
    t = t_arr(dur)
    cutoff = 300 + 5200 * np.sin(np.pi * t / dur) ** 2
    x = lowpass(rng.standard_normal(len(t)), cutoff)
    return x * np.sin(np.pi * t / dur) ** 1.5


def sfx_chime():
    out = np.zeros(int(2.2 * SR))
    for i, f in enumerate([N["C5"], N["E5"], N["G5"], N["C6"], N["E6"]]):
        place(out, i * 0.09, pluck(f, 1.6, 0.35, 0.9))
    return out


def sfx_notify():
    out = np.zeros(int(1.2 * SR))
    place(out, 0.0, pluck(N["E5"] * 2, 0.8, 0.5, 0.7))
    place(out, 0.14, pluck(N["B4"] * 2, 0.9, 0.5, 0.7))
    return out


def sfx_drop():
    t = t_arr(0.5)
    f = 160 * np.exp(-t * 7) + 45
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    out = np.zeros(int(1.2 * SR))
    place(out, 0, thump * 0.9)
    place(out, 0.04, sfx_coin() * 0.5)
    return out


def sfx_sad():
    out = np.zeros(int(2.4 * SR))
    place(out, 0.0, pluck(N["A4"], 1.4, 0.4, 0.3))
    place(out, 0.45, pluck(N["F4"], 1.8, 0.4, 0.3))
    return out


def sfx_sparkle():
    out = np.zeros(int(1.4 * SR))
    for i, f in enumerate([N["G5"], N["C6"], N["E6"], N["A5"], N["E6"]]):
        place(out, i * 0.07, pluck(f * (1 if i % 2 else 2) / 2 * 2, 0.5, 0.25, 0.9))
    return out


def sfx_tick():
    t = t_arr(0.04)
    return highpass(rng.standard_normal(len(t)), 2500) * np.exp(-t * 130) * 0.8


def sfx_swap():
    t = t_arr(0.5)
    cutoff = 400 + 3000 * (t / 0.5)
    x = lowpass(rng.standard_normal(len(t)), cutoff) * np.sin(np.pi * t / 0.5)
    out = np.zeros(int(0.9 * SR))
    place(out, 0, x * 0.7)
    place(out, 0.3, sfx_pop() * 0.6)
    return out


def main():
    dur_file, work = sys.argv[1], sys.argv[2]
    d = json.load(open(dur_file))
    total = sum(d.values())
    # the music turns bright when the logo appears (start of scene 2)
    switch = d["s01-story"]
    save(os.path.join(work, "music.wav"), music(total, switch), 0.8)
    for name, fn in [
        ("pop", sfx_pop), ("coin", sfx_coin), ("whoosh", sfx_whoosh), ("chime", sfx_chime), ("notify", sfx_notify),
        ("drop", sfx_drop), ("sad", sfx_sad), ("sparkle", sfx_sparkle), ("tick", sfx_tick), ("swap", sfx_swap),
    ]:
        save(os.path.join(work, "sfx", name + ".wav"), fn(), 0.85)
    print("music %.1f s, 10 effects" % (total + 2))


if __name__ == "__main__":
    main()
