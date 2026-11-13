#!/usr/bin/env python3
"""An original, royalty-free music bed for the launch video, synthesised from scratch (no samples, no third-party audio).
Slow minor-key pads, a soft pluck pattern and a low pulse, ~92 BPM, 128 s. Written to public/music/bed.wav, then softened with ffmpeg."""
import math, random, struct, wave, subprocess, sys
SR = 44100
BPM = 92
BEAT = 60 / BPM
DUR = 128.0
N = int(SR * DUR)
random.seed(7)
L = [0.0] * N
R = [0.0] * N

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
# Am - F - C - G, two bars each (a bar = 4 beats)
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
BAR = 4 * BEAT

def add(buf, start, samples, gain):
    i0 = int(start * SR)
    for k, v in enumerate(samples):
        j = i0 + k
        if j >= N: break
        buf[j] += v * gain

def pad(note, length, detune):
    f = hz(note) * (1 + detune)
    out = []
    n = int(length * SR)
    atk, rel = 1.6, 2.2
    for k in range(n):
        t = k / SR
        env = min(1, t / atk) * min(1, (length - t) / rel)
        v = math.sin(2 * math.pi * f * t) + 0.35 * math.sin(2 * math.pi * 2 * f * t + 0.6) + 0.12 * math.sin(2 * math.pi * 3 * f * t)
        out.append(v * env * 0.18)
    return out

def pluck(note, length=1.4):
    f = hz(note)
    out = []
    n = int(length * SR)
    for k in range(n):
        t = k / SR
        env = math.exp(-t * 3.2)
        v = math.sin(2 * math.pi * f * t) + 0.45 * math.sin(2 * math.pi * 2 * f * t) * math.exp(-t * 6)
        out.append(v * env * 0.22)
    return out

def pulse(length=0.5):
    f = 55.0
    out = []
    for k in range(int(length * SR)):
        t = k / SR
        out.append(math.sin(2 * math.pi * (f + 25 * math.exp(-t * 20)) * t) * math.exp(-t * 7) * 0.5)
    return out

bars = int(DUR / BAR)
for b in range(bars):
    chord = CHORDS[(b // 2) % 4]
    t0 = b * BAR
    if b % 2 == 0:  # a pad on every second bar, held for two
        for i, note in enumerate(chord):
            for side, det, buf in ((0, -0.002, L), (1, 0.002, R)):
                add(buf, t0, pad(note, 2 * BAR + 1.0, det), 0.9 if side == i % 2 else 0.6)
    # a soft pluck pattern, a little different each bar, panned left and right
    pat = [0, 2, 1, 3, 2, 1, 3, 2] if b % 2 == 0 else [3, 1, 2, 0, 3, 2, 1, 0]
    for s, idx in enumerate(pat):
        if b < 2 and s % 2: continue  # sparse at the start
        note = chord[idx] + 12
        ts = t0 + s * BEAT / 2
        add(L if s % 2 == 0 else R, ts, pluck(note), 0.7 if b >= 4 else 0.4)
    if b >= 6:  # a low pulse on each bar
        add(L, t0, pulse(), 0.5); add(R, t0, pulse(), 0.5)

peak = max(max(map(abs, L)), max(map(abs, R))) or 1
scale = 0.8 / peak
with wave.open('public/music/bed-raw.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    frames = bytearray()
    for l, r in zip(L, R):
        frames += struct.pack('<hh', int(max(-1, min(1, l * scale)) * 32767), int(max(-1, min(1, r * scale)) * 32767))
    w.writeframes(bytes(frames))
# soften: a gentle low-pass, a touch of echo, fade in and out
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'public/music/bed-raw.wav', '-af',
                f'lowpass=f=4200,aecho=0.7:0.6:380|610:0.28|0.2,afade=t=in:st=0:d=3,afade=t=out:st={DUR-5}:d=5', 'public/music/bed.wav'], check=True)
print('wrote public/music/bed.wav', DUR, 's')
