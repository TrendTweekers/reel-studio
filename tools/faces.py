#!/usr/bin/env python3
"""faces.py <project_dir> [--every 0.2]  ->  faces.json (FaceSample[], normalized 0..1, t = source seconds)

MediaPipe Tasks FaceDetector (short-range BlazeFace) on proxy.mp4, streamed frame by frame (constant RAM,
any video length). Small or far faces (full-body outfit shots) get a second try on an upscaled top crop.
Tracking: keep following the face nearest the previous one; switch to another person only after
SWITCH_AFTER samples in a row. Gaps under 1 s hold the last box. Longer gaps hold the last box too and set
"lost": true on those entries (additive field; old consumers ignore it). Then median + EMA smoothing.
"""
import argparse
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, project_arg, need, probe, duration_of, ffmpeg, hwaccel_args, write_json_atomic

FW, FH = 540, 960  # analysis frame size (9:16); a wide proxy (long YouTube video) uses 960x540
SWITCH_AFTER = 5   # samples in a row before following a different person
HOLD_SECONDS = 1.0


def read_frames(proxy, every):
    global FW, FH
    v = [s for s in probe(proxy)["streams"] if s.get("codec_type") == "video"]
    if v and int(v[0].get("width") or 0) > int(v[0].get("height") or 0):
        FW, FH = 960, 540
    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin"] + hwaccel_args() + [
        "-i", proxy, "-vf", f"fps=1/{every},scale={FW}:{FH}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = FW * FH * 3
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(FH, FW, 3)
    p.stdout.close()
    err = p.stderr.read()
    if p.wait() != 0:
        fail(f"ffmpeg frame read failed: {err.decode(errors='replace')[-400:]}")


class Tracker:
    """Follows one person across samples. update(candidates) -> box or None (None = not seen this sample)."""

    def __init__(self):
        self.cur = None      # last accepted box
        self.missing = 0     # samples since cur was seen
        self.alt = None      # (box, count) candidate for a person switch

    @staticmethod
    def _c(b):
        return np.array([b[0] + b[2] / 2, b[1] + b[3] / 2])

    def update(self, cands):
        if not cands:
            self.missing += 1
            self.alt = None
            return None
        if self.cur is None:
            self.cur, self.missing = max(cands, key=lambda b: b[2] * b[3]), 0
            return self.cur
        cc = self._c(self.cur)
        near = min(cands, key=lambda b: float(np.linalg.norm(self._c(b) - cc)))
        gate = 0.12 + 0.04 * min(self.missing, 10) + 0.5 * max(self.cur[2], self.cur[3])
        if float(np.linalg.norm(self._c(near) - cc)) <= gate:
            self.cur, self.missing, self.alt = near, 0, None
            return near
        # Only far-away faces. Switch person only when the same new face is the largest N samples in a row.
        big = max(cands, key=lambda b: b[2] * b[3])
        if self.alt is not None and float(np.linalg.norm(self._c(big) - self._c(self.alt[0]))) <= gate:
            self.alt = (big, self.alt[1] + 1)
        else:
            self.alt = (big, 1)
        if self.alt[1] >= SWITCH_AFTER:
            self.cur, self.missing, self.alt = big, 0, None
            return big
        self.missing += 1
        return None


def smooth(arr, win=5, alpha=0.5):
    """arr: (n,4) without gaps. Median filter, then forward-backward EMA."""
    n = len(arr)
    h = win // 2
    med = arr.copy()
    for i in range(n):
        med[i] = np.median(arr[max(0, i - h): i + h + 1], axis=0)
    fwd = med.copy()
    for i in range(1, n):
        fwd[i] = alpha * med[i] + (1 - alpha) * fwd[i - 1]
    bwd = fwd.copy()
    for i in range(n - 2, -1, -1):
        bwd[i] = alpha * fwd[i] + (1 - alpha) * bwd[i + 1]
    return np.clip(bwd, 0.0, 1.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project_dir")
    ap.add_argument("--every", type=float, default=0.2)
    ap.add_argument("--model", choices=["auto", "short"], default="auto")  # "full" was removed: it cannot run
    a = ap.parse_args()
    d = project_arg(a.project_dir)
    proxy = need(d, "proxy.mp4")
    dur = duration_of(probe(proxy))
    total = max(1, int(dur / a.every))

    progress("load-model", 0.0)
    from _facedet import FaceFinder
    finder = FaceFinder()
    progress("load-model", 1.0)

    tr = Tracker()
    boxes, stages = [], {}
    for i, fr in enumerate(read_frames(proxy, a.every)):
        cands, stage = finder.detect_all(fr)
        stages[stage] = stages.get(stage, 0) + (1 if cands else 0)
        boxes.append(tr.update(cands))  # only the 4 floats per sample are kept, never the frames
        if i % 10 == 0:
            progress("detect", min(1.0, i / total))

    n = len(boxes)
    if n == 0:
        fail("no frames could be read from proxy.mp4")
    found = sum(b is not None for b in boxes)
    if found == 0:
        write_json_atomic(os.path.join(d, "faces.json"), [])
        emit(done=True, samples=0, detected=0, model="short", warning="no face found")
        return

    # Fill gaps: hold the last box (back-fill before the first detection). Gaps >= 1 s are marked lost.
    hold_n = max(1, int(round(HOLD_SECONDS / a.every)))
    filled = np.zeros((n, 4))
    lost = [False] * n
    last, run = None, 0
    first = next(b for b in boxes if b is not None)
    for i, b in enumerate(boxes):
        if b is not None:
            last, run = b, 0
            filled[i] = b
        else:
            run += 1
            filled[i] = last if last is not None else first
            if last is None or run >= hold_n:
                lost[i] = True
    # A long gap is lost from its first sample on, not only after the 1 s hold.
    i = 0
    while i < n:
        if boxes[i] is None:
            j = i
            while j < n and boxes[j] is None:
                j += 1
            if (j - i) >= hold_n or i == 0:
                for k in range(i, j):
                    lost[k] = True
            i = j
        else:
            i += 1
    sm = smooth(filled)
    out = []
    for i, v in enumerate(sm):
        e = {"t": round(i * a.every, 3), "x": round(float(v[0]), 4), "y": round(float(v[1]), 4),
             "w": round(float(v[2]), 4), "h": round(float(v[3]), 4)}
        if lost[i]:
            e["lost"] = True
        out.append(e)
    write_json_atomic(os.path.join(d, "faces.json"), out)
    emit(done=True, samples=n, detected=found, detectionRate=round(found / n, 3), model="short",
         lostSamples=int(sum(lost)), cropFallbackUsed=int(sum(v for k, v in stages.items() if k != "full")))


if __name__ == "__main__":
    run_tool(main)
