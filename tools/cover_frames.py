#!/usr/bin/env python3
"""cover_frames.py <project_dir> [--count 8]  ->  covers/c<NN>-<t>.jpg + covers/candidates.json (CoverCandidate[])

Samples proxy.mp4 every 0.25 s (only inside edit.json segments if that file exists) and scores each frame:
face size + horizontal centering, sharpness of the face crop (variance of Laplacian), eyes open and
mouth calm (MediaPipe FaceLandmarker blendshapes), small smile bonus. Picks the top N, >= 1.5 s apart.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, project_arg, need, probe, duration_of, ffmpeg, model_file, write_json_atomic

URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
W, H = 1080, 1920
EVERY = 0.25
MIN_GAP = 1.5


def main():
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision

    ap = argparse.ArgumentParser()
    ap.add_argument("project_dir")
    ap.add_argument("--count", type=int, default=8)
    a = ap.parse_args()
    d = project_arg(a.project_dir)
    proxy = need(d, "proxy.mp4")
    dur = duration_of(probe(proxy))

    segs = [(0.0, dur)]
    ej = os.path.join(d, "edit.json")
    if os.path.isfile(ej):
        try:
            s = json.load(open(ej, encoding="utf-8")).get("segments") or []
            if s:
                segs = [(float(x["start"]), float(x["end"])) for x in s]
        except Exception:  # noqa: BLE001
            pass

    def kept(t):
        return any(s <= t <= e for s, e in segs)

    progress("load-model", 0.0)
    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=model_file("face_landmarker.task", URL)),
        running_mode=vision.RunningMode.IMAGE, num_faces=2, output_face_blendshapes=True,
        min_face_detection_confidence=0.4, min_face_presence_confidence=0.4))
    progress("load-model", 1.0)

    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-i", proxy,
           "-vf", f"fps=1/{EVERY}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = W * H * 3
    total = max(1, int(dur / EVERY))
    rows = []  # dicts with raw measures
    i = 0
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        t = round(i * EVERY, 3)
        i += 1
        if i % 8 == 0:
            progress("score", i / total)
        if not kept(t) or t > dur - 0.1:
            continue
        rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        if not res.face_landmarks:
            continue
        best = None
        for pts, bs in zip(res.face_landmarks, res.face_blendshapes):
            xs = np.array([q.x for q in pts]); ys = np.array([q.y for q in pts])
            area = (xs.max() - xs.min()) * (ys.max() - ys.min())
            if best is None or area > best[0]:
                best = (area, xs, ys, {c.category_name: c.score for c in bs})
        _, xs, ys, b = best
        x0, x1 = max(0, int(xs.min() * W)), min(W, int(xs.max() * W))
        y0, y1 = max(0, int(ys.min() * H)), min(H, int(ys.max() * H))
        if x1 - x0 < 20 or y1 - y0 < 20:
            continue
        crop = cv2.cvtColor(np.ascontiguousarray(rgb[y0:y1, x0:x1]), cv2.COLOR_RGB2GRAY)
        crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_AREA)
        sharp = float(cv2.Laplacian(crop, cv2.CV_64F).var())
        rows.append({"t": t, "h": float(ys.max() - ys.min()), "cx": float((xs.min() + xs.max()) / 2),
                     "sharp": sharp, "blink": max(b.get("eyeBlinkLeft", 0), b.get("eyeBlinkRight", 0)),
                     "jaw": b.get("jawOpen", 0),
                     "smile": (b.get("mouthSmileLeft", 0) + b.get("mouthSmileRight", 0)) / 2})
    p.stdout.close()
    err = p.stderr.read()
    if p.wait() != 0:
        fail(f"ffmpeg failed: {err.decode(errors='replace')[-400:]}")
    if not rows:
        fail("no face found in the kept parts of the video")

    med = float(np.median([r["sharp"] for r in rows]))
    ref = float(np.percentile([r["sharp"] for r in rows], 90)) or 1.0
    scored = []
    for r in rows:
        if r["blink"] > 0.45 or r["sharp"] < 0.5 * med:
            continue  # eyes closing or motion blur
        size_s = min(1.0, r["h"] / 0.16)
        size_s *= 1.0 if r["h"] <= 0.5 else 0.7
        center_s = max(0.0, 1 - abs(r["cx"] - 0.5) / 0.4)
        face_s = 0.6 * size_s + 0.4 * center_s
        sharp_s = min(1.0, r["sharp"] / ref)
        eyes_s = 1 - min(1.0, r["blink"] / 0.45)
        mouth_s = 1 - min(1.0, max(0.0, r["jaw"] - 0.12) / 0.35)
        smile_s = min(1.0, r["smile"] / 0.5)
        score = 0.30 * sharp_s + 0.25 * eyes_s + 0.20 * face_s + 0.15 * mouth_s + 0.10 * smile_s
        scored.append((score, r["t"]))
    if not scored:
        fail("every sampled frame was rejected (blinks or blur)")
    scored.sort(reverse=True)
    picks = []
    for sc, t in scored:
        if all(abs(t - pt) >= MIN_GAP for _, pt in picks):
            picks.append((sc, t))
        if len(picks) >= a.count:
            break

    cdir = os.path.join(d, "covers")
    os.makedirs(cdir, exist_ok=True)
    for f in os.listdir(cdir):
        if f.startswith("c") and f.endswith(".jpg") and f[1:3].isdigit():
            os.remove(os.path.join(cdir, f))
    out = []
    for n, (sc, t) in enumerate(picks, 1):
        fn = f"c{n:02d}-{t:.2f}.jpg"
        r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-ss", f"{t:.3f}",
                            "-i", proxy, "-frames:v", "1", "-q:v", "2", os.path.join(cdir, fn)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"frame extract failed: {r.stderr[-300:]}")
        out.append({"t": t, "file": f"covers/{fn}", "score": round(float(sc), 3)})
        progress("extract", n / len(picks))
    write_json_atomic(os.path.join(cdir, "candidates.json"), out, indent=1)
    emit(done=True, candidates=len(out), scored=len(scored), sampled=len(rows))


if __name__ == "__main__":
    run_tool(main)
