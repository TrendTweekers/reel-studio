#!/usr/bin/env python3
"""cutout.py <project_dir> [--fps 15] [--crf 30] [--mask-width 256]  ->  cutout.webm (VP9 + alpha, no audio)

Fast pipeline (59 s clip: minutes -> seconds):
  1. proxy frames are read at a small size (--mask-width, default 256 px wide) and segmented with MediaPipe
     (selfie_segmenter, or --model multiclass) at --fps (default 15); the masks in between are interpolated,
     with temporal smoothing. Masks are 8 bit grey at the small size.
  2. The small masks are piped straight into ONE ffmpeg process. It scales them up to 1080x1920 (bicubic),
     sharpens the soft edge with a smoothstep curve (no full-size blur: it cost more than the encode), and alphamerges it with proxy.mp4.
  3. libvpx-vp9 realtime encode (-deadline realtime -cpu-used 8 -row-mt 1), yuva420p.
No intermediate mask file. Progress: step "segment" (0..1, frames fed to the encoder), then "encode" (the tail).
"""
import argparse
import os
import subprocess
import sys
import threading
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, project_arg, need, probe, duration_of, ffmpeg, model_file, hwaccel_args, perf_cores

URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
URL_BIN = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
OW, OH = 1080, 1920
FPS = 30
LO, HI = 0.35, 0.65  # confidence ramp that becomes the soft edge


def main():
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision

    ap = argparse.ArgumentParser()
    ap.add_argument("project_dir")
    ap.add_argument("--fps", type=float, default=15.0, help="mask compute rate; masks are interpolated to 30 fps")
    ap.add_argument("--crf", type=int, default=30)
    ap.add_argument("--model", choices=["multiclass", "binary"], default="binary")
    ap.add_argument("--mask-width", type=int, default=256, help="width of the frames that are segmented (9:16)")
    ap.add_argument("--keep-mask", action="store_true", help="ignored (there is no mask file any more)")
    a = ap.parse_args()
    d = project_arg(a.project_dir)
    proxy = need(d, "proxy.mp4")
    dur = duration_of(probe(proxy))
    total = max(1, int(round(dur * FPS)))
    k = max(1, int(round(FPS / max(1.0, min(a.fps, FPS)))))
    MW = max(64, a.mask_width // 2 * 2)
    MH = int(round(MW * OH / OW / 2)) * 2

    progress("load-model", 0.0)
    if a.model == "multiclass":
        mpath = model_file("selfie_multiclass_256x256.tflite", URL)
    else:
        mpath = model_file("selfie_segmenter.tflite", URL_BIN)
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=mpt.BaseOptions(model_asset_path=mpath),
        running_mode=vision.RunningMode.IMAGE, output_category_mask=False, output_confidence_masks=True))
    progress("load-model", 1.0)

    def person_mask(rgb):
        res = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        m = res.confidence_masks[0].numpy_view()
        if a.model == "multiclass":
            m = 1.0 - m  # class 0 = background
        m = np.asarray(m, dtype=np.float32).reshape(MH, MW)
        # soft edge: a small blur at the small size (about 2.5 px at 1080 wide); the bicubic upscale does the rest
        return cv2.GaussianBlur(m, (0, 0), 0.6 * MW / 256)

    def to_u8(m):
        return (np.clip(m, 0, 1) * 255.0 + 0.5).astype(np.uint8).tobytes()

    # smoothstep on the upscaled 8 bit mask: ramp LO..HI -> 0..1 (tightens the halo, keeps a soft edge)
    t = f"clip((val/255-{LO})/{HI - LO},0,1)"
    smooth = f"{t}*{t}*(3-2*{t})*255"
    fc = (f"[1:v]scale={OW}:{OH}:flags=bicubic,lut=y='{smooth}'[m];"
          "[0:v][m]alphamerge,format=yuva420p[v]")
    out = os.path.join(d, "cutout.webm")
    tmp = os.path.join(d, "cutout.tmp.webm")
    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-progress", "pipe:1", "-nostats"] + hwaccel_args() + [
        "-i", proxy, "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{MW}x{MH}", "-framerate", str(FPS), "-i", "-",
        "-filter_complex", fc, "-map", "[v]", "-an", "-r", str(FPS),
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", str(a.crf),
        "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-tile-columns", "2", "-threads", str(perf_cores()),
        "-f", "webm", tmp]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False)
    enc_t = {"t": 0.0}
    enc_err = []

    def pump_progress():
        for line in enc.stdout:
            line = line.decode(errors="replace")
            if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
                try:
                    enc_t["t"] = int(line.split("=")[1]) / 1e6
                except ValueError:
                    pass

    def pump_err():
        enc_err.append(enc.stderr.read())

    threading.Thread(target=pump_progress, daemon=True).start()
    te = threading.Thread(target=pump_err, daemon=True)
    te.start()

    rd = subprocess.Popen(
        [ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin"] + hwaccel_args() +
        ["-i", proxy, "-vf", f"fps={FPS},scale={MW}:{MH}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = MW * MH * 3

    smooth_prev = None
    ALPHA_NEW = 0.7  # temporal smoothing weight of the new mask
    last_key = None  # (index, mask)
    pending = []     # frame indices waiting for the next key mask
    written = 0
    last_emit = 0.0

    def write(m):
        nonlocal written, last_emit
        try:
            enc.stdin.write(to_u8(m))
        except BrokenPipeError:
            te.join(timeout=5)
            fail(f"cutout encode stopped early: {b''.join(enc_err).decode(errors='replace')[-500:]}")
        written += 1
        now = time.time()
        if now - last_emit > 0.5:
            progress("segment", written / total)
            last_emit = now

    i = 0
    while True:
        buf = rd.stdout.read(size)
        if len(buf) < size:
            break
        if i % k == 0:
            m = person_mask(np.frombuffer(buf, np.uint8).reshape(MH, MW, 3))
            if smooth_prev is not None:
                m = ALPHA_NEW * m + (1 - ALPHA_NEW) * smooth_prev
            smooth_prev = m
            if last_key is not None:
                li, lm = last_key
                for p in pending:
                    w = (p - li) / (i - li)
                    write((1 - w) * lm + w * m)
            pending = []
            write(m)
            last_key = (i, m)
        else:
            pending.append(i)
        i += 1
    rd.stdout.close()
    rerr = rd.stderr.read()
    if rd.wait() != 0:
        enc.kill()
        fail(f"ffmpeg frame read failed: {rerr.decode(errors='replace')[-400:]}")
    if last_key is None:
        enc.kill()
        fail("no frames read from proxy.mp4")
    for _ in pending:
        write(last_key[1])
    enc.stdin.close()
    progress("segment", 1.0)
    while enc.poll() is None:
        progress("encode", enc_t["t"] / dur if dur else 0.0)
        time.sleep(0.5)
    te.join(timeout=5)
    if enc.returncode != 0:
        fail(f"cutout encode failed: {b''.join(enc_err).decode(errors='replace')[-600:]}")
    progress("encode", 1.0)
    os.replace(tmp, out)

    info = probe(out)
    v = [s for s in info["streams"] if s["codec_type"] == "video"][0]
    tags = {kk.lower(): vv for kk, vv in (v.get("tags") or {}).items()}
    alpha = v.get("pix_fmt") == "yuva420p" or tags.get("alpha_mode") == "1"
    if not alpha:
        fail("cutout.webm has no alpha channel (ffprobe shows neither yuva420p nor alpha_mode=1)")
    emit(done=True, cutout="cutout.webm", frames=written, duration=round(duration_of(info), 3),
         pixFmt=v.get("pix_fmt"), alphaMode=tags.get("alpha_mode"), width=v["width"], height=v["height"])


if __name__ == "__main__":
    run_tool(main)
