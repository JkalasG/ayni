"""
Builds the two audio tracks of the video from the scene files:
  work/vo_track.wav   every scene's voice-over, placed at its time on the final timeline
  work/sfx_track.wav  every sound effect named in work/clips/<scene>.cues.json, plus a whoosh between scenes

Usage:  python mix.py work scene-id-1 scene-id-2 ...   (in the order of the video)
"""
import json
import os
import sys
import wave

import numpy as np

SR = 44100
LEAD = 0.35


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def place(buf, start, sound, gain=1.0):
    i = int(max(0, start) * SR)
    j = min(len(buf), i + len(sound))
    if i < j:
        buf[i:j] += sound[: j - i] * gain


def main():
    work = sys.argv[1]
    ids = sys.argv[2:]
    durations = json.load(open(os.path.join(work, "durations.json")))
    total = sum(durations[i] for i in ids)
    n = int((total + 1.0) * SR)
    vo = np.zeros(n)
    sfx = np.zeros(n)
    sfx_files = {f[:-4]: read_wav(os.path.join(work, "sfx", f)) for f in os.listdir(os.path.join(work, "sfx")) if f.endswith(".wav")}

    t = 0.0
    for k, sid in enumerate(ids):
        d = durations[sid]
        v = os.path.join(work, "vo", sid + ".wav")
        if os.path.exists(v):
            place(vo, t + LEAD, read_wav(v), 0.95)
        cues_file = os.path.join(work, "clips", sid + ".cues.json")
        if os.path.exists(cues_file):
            for c in json.load(open(cues_file)):
                if c["sfx"] in sfx_files and 0 <= c["at"] < d:
                    place(sfx, t + c["at"], sfx_files[c["sfx"]], 0.55 * c.get("gain", 1.0))
        if k > 0:
            place(sfx, t - 0.18, sfx_files["whoosh"], 0.42)  # the cut into this scene
        t += d
    write_wav(os.path.join(work, "vo_track.wav"), vo)
    write_wav(os.path.join(work, "sfx_track.wav"), sfx)
    print("tracks: %.1f s, voice peak %.2f, effects peak %.2f" % (total, np.max(np.abs(vo)), np.max(np.abs(sfx))))


if __name__ == "__main__":
    main()
