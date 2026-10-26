#!/usr/bin/env python3
"""gen_sfx.py  ->  assets/sfx/<name>.wav  (48 kHz, 16-bit mono). Fully synthesized (numpy/scipy), no samples."""
import os
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, emit, run_tool, progress

SR = 48000
OUT = os.path.join(ROOT, "assets", "sfx")
rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def expenv(n, tau, attack=0.0008):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    if attack > 0:
        e *= np.minimum(1.0, t / attack)
    return e


def sweep_sine(dur, f0, f1, tau_f):
    """sine whose frequency falls exponentially from f0 to f1 with time constant tau_f"""
    t = t_(dur)
    f = f1 + (f0 - f1) * np.exp(-t / tau_f)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def place(buf, sig, at):
    i = int(at * SR)
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n]


def tick(dur, lo, hi, tau, body_f=None, body_amp=0.0, body_tau=0.012):
    n = int(dur * SR)
    s = bp(noise(dur), lo, hi) * expenv(n, tau, 0.0002)
    s = s / (np.abs(s).max() + 1e-9)
    if body_f:
        s = s + body_amp * np.sin(2 * np.pi * body_f * t_(dur)) * expenv(n, body_tau, 0.0003)
    return s


def finalize(x, peak_db=-6.0, fade_in=0.002, fade_out=0.01):
    x = x - np.mean(x)
    x = hp(x, 25, 1)  # kill residual sub-sonic drift / DC
    n = len(x)
    fi, fo = int(fade_in * SR), int(fade_out * SR)
    if fi:
        x[:fi] *= np.linspace(0, 1, fi) ** 2
    if fo:
        x[-fo:] *= np.linspace(1, 0, fo) ** 2
    x = x / (np.abs(x).max() + 1e-12) * (10 ** (peak_db / 20))
    return x


def s_click():
    d = 0.09
    return finalize(tick(d, 1800, 7000, 0.0025, 2100, 0.5, 0.010), fade_out=0.02)


def s_double_click():
    d = 0.24
    b = np.zeros(int(d * SR))
    c = tick(0.07, 1800, 7000, 0.0025, 2100, 0.5, 0.010)
    place(b, c, 0.0)
    place(b, c * 0.9, 0.095)
    return finalize(b, fade_out=0.03)


def s_soft_click():
    d = 0.09
    s = tick(d, 700, 3200, 0.004, 900, 0.7, 0.015)
    s = lp(s, 3500)
    # slower attack for a rounder feel
    n = len(s)
    s *= np.minimum(1, t_(d) / 0.0015)
    return finalize(s, peak_db=-13.0, fade_in=0.003, fade_out=0.025)


def s_pop():
    d = 0.2
    n = int(d * SR)
    body = sweep_sine(d, 1100, 220, 0.025) * expenv(n, 0.045, 0.0004)
    top = bp(noise(d), 2500, 8000) * expenv(n, 0.003, 0.0001) * 0.25
    return finalize(body + top, fade_out=0.04)


def s_soft_pop():
    d = 0.18
    n = int(d * SR)
    body = sweep_sine(d, 620, 190, 0.03) * expenv(n, 0.05, 0.003)
    return finalize(lp(body, 4000), peak_db=-13.0, fade_in=0.004, fade_out=0.05)


def s_sticker_slap():
    d = 0.34
    n = int(d * SR)
    thump = sweep_sine(d, 190, 55, 0.03) * expenv(n, 0.07, 0.0005)
    paper = bp(noise(d), 900, 6500) * expenv(n, 0.028, 0.0002)
    crack = hp(noise(d), 3000) * expenv(n, 0.004, 0.0001) * 0.7
    flutter = bp(noise(d), 1500, 4500) * expenv(n, 0.07, 0.03) * (0.5 + 0.5 * np.sin(2 * np.pi * 38 * t_(d))) * 0.12
    x = thump * 1.0 + paper * 0.55 + crack * 0.35 + flutter
    return finalize(x, fade_out=0.06)


def s_camera_shutter():
    d = 0.3
    b = np.zeros(int(d * SR))

    def blade(dur, amp):
        n = int(dur * SR)
        s = bp(noise(dur), 1500, 9000) * expenv(n, 0.007, 0.0002)
        s = s / (np.abs(s).max() + 1e-9)
        th = np.sin(2 * np.pi * 320 * t_(dur)) * expenv(n, 0.012, 0.0003) * 0.6
        ring = np.sin(2 * np.pi * 2650 * t_(dur)) * expenv(n, 0.009, 0.0003) * 0.18
        return (s + th + ring) * amp

    place(b, blade(0.08, 1.0), 0.0)
    place(b, blade(0.12, 0.8), 0.075)
    # tiny spring rattle between the two
    rat = bp(noise(0.06), 3000, 8000) * expenv(int(0.06 * SR), 0.015, 0.002) * 0.12
    place(b, rat, 0.03)
    return finalize(b, fade_out=0.08)


def s_whoosh():
    d = 0.6
    n = int(d * SR)
    t = t_(d)
    x = noise(d)
    # Chamberlin state-variable band-pass, centre frequency sweeps 250 -> 3200 Hz -> 1800 Hz
    prog = t / d
    fc = 250 * (3200 / 250) ** np.minimum(1, prog / 0.55)
    fc = np.where(prog > 0.55, 3200 - (3200 - 1800) * (prog - 0.55) / 0.45, fc)
    f = 2 * np.sin(np.pi * fc / SR)
    q = 1 / 2.2
    low = band = 0.0
    out = np.empty(n)
    for i in range(n):
        low += f[i] * band
        high = x[i] - low - q * band
        band += f[i] * high
        out[i] = band
    env = np.sin(np.pi * np.clip(prog, 0, 1)) ** 1.6
    env = np.where(prog < 0.45, np.sin(np.pi / 2 * prog / 0.45) ** 2, np.cos(np.pi / 2 * (prog - 0.45) / 0.55) ** 2)
    out = out * env
    air = bp(noise(d), 4500, 9000) * env * 0.02
    out = lp(out / (np.abs(out).max() + 1e-9), 9000)
    return finalize(out + air, fade_in=0.02, fade_out=0.12)


def s_ding():
    d = 0.6
    n = int(d * SR)
    t = t_(d)
    f0 = 1568.0  # G6
    parts = [(1.0, 1.0, 0.30), (2.76, 0.45, 0.16), (5.4, 0.2, 0.09), (8.93, 0.08, 0.05), (2.0, 0.35, 0.22)]
    x = np.zeros(n)
    for ratio, amp, tau in parts:
        x += amp * np.sin(2 * np.pi * f0 * ratio * t + ratio) * np.exp(-t / tau)
    x *= np.minimum(1, t / 0.0008)
    x += 0.15 * hp(noise(d), 5000) * expenv(n, 0.004, 0.0001)
    return finalize(x, fade_out=0.15)


def s_typewriter():
    d = 0.16
    n = int(d * SR)
    t = t_(d)
    clack = bp(noise(d), 1800, 6500) * expenv(n, 0.005, 0.0001)
    clack /= np.abs(clack).max() + 1e-9
    thunk = np.sin(2 * np.pi * 170 * t) * expenv(n, 0.02, 0.0003) * 0.7
    metal = (np.sin(2 * np.pi * 3100 * t) + 0.6 * np.sin(2 * np.pi * 4700 * t)) * expenv(n, 0.012, 0.0002) * 0.12
    x = np.zeros(n)
    x += clack + thunk + metal
    place(x, bp(noise(0.04), 2500, 7000) * expenv(int(0.04 * SR), 0.006, 0.0002) * 0.25, 0.028)  # return rebound
    return finalize(x, fade_out=0.04)


SOUNDS = {
    "double-click": s_double_click,
    "click": s_click,
    "soft-click": s_soft_click,
    "pop": s_pop,
    "soft-pop": s_soft_pop,
    "sticker-slap": s_sticker_slap,
    "camera-shutter": s_camera_shutter,
    "whoosh": s_whoosh,
    "ding": s_ding,
    "typewriter": s_typewriter,
}


def write_wav(path, x):
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    info = {}
    for i, (name, fn) in enumerate(SOUNDS.items()):
        x = fn()
        write_wav(os.path.join(OUT, name + ".wav"), x)
        info[name] = {"seconds": round(len(x) / SR, 3), "peakDb": round(20 * np.log10(np.abs(x).max()), 1)}
        progress("sfx", (i + 1) / len(SOUNDS))
    emit(done=True, dir="assets/sfx", files=info)


if __name__ == "__main__":
    run_tool(main)
