#!/usr/bin/env python3
"""normalize.py <project_dir> [--long]  ->  proxy.mp4 (1080x1920, 30fps CFR, H.264, AAC 48k stereo) + audio16k.wav

--long (a YouTube video): no crop. Wide sources become 1920x1080, tall ones 1080x1920 (fit + pad), and the
picture is stored a little smaller (crf 21), because a 30 minute proxy at crf 18 would take several GB.

Order of the video chain is always: fps -> scale/crop to 1080x1920 -> colour (HDR tone map). Doing the
colour step last means it only touches 1080x1920 at 30 fps (about 5x faster than at 4K 60 fps).
Audio starts at 0 like the video (`aresample=async=1:first_pts=0`), so word times match the picture.
Landscape sources are cropped around the median face x (about 10 sampled frames), not the centre.

HDR tone-map paths (tried in order, each one checked by a tiny self-test before it is used; if the real
encode still fails the next path is tried; the path that ran is in the final line as "tonemap"):
  videotoolbox  macOS only: hardware decode + scale_vt colour conversion (needs ffmpeg 7.1+ with scale_vt)
  zscale+hable  needs zimg (ffmpeg-full / johnvansickle static). Best quality.
  libplacebo    needs a Vulkan device
  lut-hable     plain ffmpeg (any build): HLG/PQ -> linear -> BT.2020 to BT.709 -> soft-knee tone map ->
                BT.709, all in 16 bit with lutrgb + colorchannelmixer. Works in Homebrew ffmpeg without zimg.
Env: REEL_HDR_PATH=<name> forces one path first. REEL_NO_ZSCALE=1 pretends zscale is missing (testing).
     REEL_NO_HWACCEL=1 turns hardware decode off.
"""
import os
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, ffmpeg, probe, duration_of, project_arg, find_source, run_ffmpeg_progress, hwaccel_args

W, H, FPS = 1080, 1920, 30


def has_filter(name):
    if name == "zscale" and os.environ.get("REEL_NO_ZSCALE"):
        return False
    out = subprocess.run([ffmpeg(), "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return any(len(l.split()) > 1 and l.split()[1] == name for l in out.splitlines())


def is_hdr(v):
    trc = (v.get("color_transfer") or "").lower()
    if trc in ("smpte2084", "arib-std-b67"):
        return True
    for sd in v.get("side_data_list", []) or []:
        if "dolby vision" in (sd.get("side_data_type") or "").lower():
            return True
    return False


def rotation_of(v):
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            return int(round(float(sd["rotation"])))
    try:
        return int(round(float((v.get("tags") or {}).get("rotate", 0))))
    except (TypeError, ValueError):
        return 0


# ---------------------------------------------------------------- HDR paths

def lut_hable_chain(trc):
    """Plain-ffmpeg tone map in 16 bit. Scale: linear 16 bit value 1.0 = 5 x SDR white (1015 nits)."""
    if trc == "arib-std-b67":  # HLG inverse OETF + system gamma 1.2 (1000 nit display), 203 nit = SDR white
        lin = ("clip(pow(if(lte(val/maxval,0.5),pow(val/maxval,2)/3,"
               "(exp((val/maxval-0.55991073)/0.17883277)+0.28466892)/12),1.2)*1000/203/5,0,1)*maxval")
    else:  # PQ (ST 2084) EOTF
        e = "pow(val/maxval,1/78.84375)"
        lin = (f"clip(pow(max({e}-0.8359375,0)/(18.8515625-18.6875*{e}),1/0.1593017578125)*10000/203/5,0,1)*maxval")
    # soft knee: linear up to 0.8, then rolls off to 1.0; then BT.709 OETF
    t = "(val/maxval*5*0.8)"
    knee = f"if(lt({t},0.8),{t},0.8+0.2*(1-exp(-({t}-0.8)/0.2)))"
    oetf = f"if(lt({knee},0.018),4.5*({knee}),1.099*pow({knee},0.45)-0.099)"
    enc = f"clip({oetf},0,1)*maxval"
    mix = ("colorchannelmixer=rr=1.6605:rg=-0.5876:rb=-0.0728:gr=-0.1246:gg=1.1329:gb=-0.0083:"
           "br=-0.0182:bg=-0.1006:bb=1.1187")
    return ("scale=in_color_matrix=bt2020:in_range=tv,format=gbrp16le,"
            f"lutrgb=r='{lin}':g='{lin}':b='{lin}',{mix},lutrgb=r='{enc}':g='{enc}':b='{enc}',"
            "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p")


def hdr_paths(trc):
    """Ordered candidates: (name, colour_filters, extra_global_args)."""
    c = []
    if sys.platform == "darwin" and has_filter("scale_vt"):
        c.append(("videotoolbox",
                  "format=p010le,hwupload,scale_vt=color_matrix=bt709:color_primaries=bt709:color_transfer=bt709,"
                  "hwdownload,format=nv12,format=yuv420p",
                  ["-init_hw_device", "videotoolbox=vt", "-filter_hw_device", "vt"]))
    if has_filter("zscale") and has_filter("tonemap"):
        c.append(("zscale+hable",
                  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
                  "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p", []))
    if has_filter("libplacebo"):
        c.append(("libplacebo",
                  "libplacebo=tonemapping=bt.2390:colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv:"
                  "format=yuv420p", []))
    if has_filter("lutrgb") and has_filter("colorchannelmixer"):
        c.append(("lut-hable", lut_hable_chain(trc), []))
    want = os.environ.get("REEL_HDR_PATH")
    if want:
        c.sort(key=lambda x: x[0] != want)
    return c


def self_test_hdr(colour, gargs, trc):
    """Run the colour chain on a tiny tagged HLG/PQ clip. True when ffmpeg succeeds and the picture is sane."""
    try:
        with tempfile.TemporaryDirectory() as td:
            clip = os.path.join(td, "t.mkv")
            r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i",
                                "testsrc2=s=320x240:d=0.3:r=30,format=yuv420p10le", "-c:v", "ffv1",
                                "-color_trc", trc, "-colorspace", "bt2020nc", "-color_primaries", "bt2020",
                                "-color_range", "tv", clip], capture_output=True, timeout=60)
            if r.returncode != 0:
                return False
            vf = f"fps={FPS},scale=270:480:force_original_aspect_ratio=increase,crop=270:480,{colour}"
            r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin"] + gargs +
                               ["-i", clip, "-vf", vf, "-frames:v", "2", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
                               capture_output=True, timeout=120)
            if r.returncode != 0 or len(r.stdout) < 270 * 480:
                return False
            m = float(np.frombuffer(r.stdout[: 270 * 480], np.uint8).mean())
            return 20 < m < 235
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------- landscape crop

def face_crop_x(src, dur, dw, dh, sw):
    """Median face centre x (0..1) over ~10 sampled frames -> crop x in the 1920-tall scaled frame; None = centre."""
    try:
        from _facedet import FaceFinder
        finder = FaceFinder()
    except Exception as e:  # noqa: BLE001
        emit(warning=f"face crop unavailable ({type(e).__name__}); centre crop used")
        return None
    fh = 720
    fw = int(round(dw * fh / dh / 2)) * 2
    xs = []
    n = 10
    for i in range(n):
        t = max(0.0, dur * (i + 0.5) / n) if dur else 0.0
        r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", f"{t:.2f}", "-i", src,
                            "-frames:v", "1", "-vf", f"scale={fw}:{fh}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           capture_output=True)
        if len(r.stdout) < fw * fh * 3:
            continue
        fr = np.frombuffer(r.stdout[: fw * fh * 3], np.uint8).reshape(fh, fw, 3)
        faces, _ = finder.detect_all(fr)
        if faces:
            b = max(faces, key=lambda b: b[2] * b[3])
            xs.append(b[0] + b[2] / 2)
        progress("face-crop", (i + 1) / n)
    if len(xs) < 3:
        return None
    cx = float(np.median(xs))
    x = int(round(cx * sw - W / 2))
    x = max(0, min(sw - W, x))
    return x - (x % 2)


def main():
    if len(sys.argv) < 2:
        fail("usage: normalize.py <project_dir> [--long]")
    d = project_arg(sys.argv[1])
    long_video = "--long" in sys.argv[2:]
    src = find_source(d)
    info = probe(src)
    vs = [s for s in info["streams"] if s.get("codec_type") == "video" and s.get("disposition", {}).get("attached_pic", 0) != 1]
    if not vs:
        fail("source has no video stream")
    v = vs[0]
    has_audio = any(s.get("codec_type") == "audio" for s in info["streams"])
    dur = duration_of(info)
    hdr = is_hdr(v)
    rot = rotation_of(v)
    dw, dh = int(v.get("width") or 0), int(v.get("height") or 0)
    if abs(rot) in (90, 270):
        dw, dh = dh, dw
    progress("probe", 1.0)

    # Geometry: cover-crop to 9:16. Landscape: crop around her face, not the centre.
    crop_x, crop_mode = None, "center"
    out_w, out_h = W, H
    if long_video:
        out_w, out_h = (1920, 1080) if dw >= dh else (1080, 1920)
        crop_mode = "none"
        geometry = (f"setsar=1,fps={FPS},scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:flags=lanczos,"
                    f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:black")
    elif dw > dh > 0:
        sw = int(round(dw * H / dh / 2)) * 2
        if sw > W:
            crop_x = face_crop_x(src, dur, dw, dh, sw)
            crop_mode = "face" if crop_x is not None else "center"
    if not long_video:
        crop = f"crop={W}:{H}" + (f":x={crop_x}:y=0" if crop_x is not None else "")
        geometry = f"setsar=1,fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,{crop}"

    # Attempt list: (label, colour tail, global args, tonemap name). Hardware decode is tried first on macOS.
    trc = (v.get("color_transfer") or "").lower()
    if trc not in ("smpte2084", "arib-std-b67"):
        trc = "arib-std-b67"  # Dolby Vision profile 8.4 etc: the base layer is HLG
    attempts = []
    if hdr:
        for name, colour, gargs in hdr_paths(trc):
            if self_test_hdr(colour, gargs + (hwaccel_args() if name == "videotoolbox" else []), trc):
                attempts.append((name, f"{geometry},{colour}", gargs))
            else:
                emit(info=f"hdr path {name}: self-test failed, skipped")
        if not attempts:
            emit(warning="no HDR tone-map path works: converting without tone mapping")
            attempts.append(("colorspace-fallback", f"{geometry},colorspace=all=bt709:iall=bt2020:fast=1,format=yuv420p", []))
    else:
        attempts.append(("none", f"{geometry},format=yuv420p", []))
    emit(info="video paths: " + ", ".join(a[0] for a in attempts) + f"; crop={crop_mode}")

    proxy = os.path.join(d, "proxy.mp4")
    tmp = os.path.join(d, "proxy.tmp.mp4")
    used, last_err = None, None
    for name, vf, gargs in attempts:
        for hw in ([hwaccel_args(), []] if hwaccel_args() else [[]]):
            args = list(gargs) + list(hw) + ["-i", src]
            if not has_audio:
                args += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
            args += ["-map", "0:v:0", "-map", "0:a:0" if has_audio else "1:a:0"]
            args += ["-vf", vf,
                     # Audio starts at 0 like the video: pads silence when the audio track starts late.
                     "-af", "aresample=async=1:first_pts=0",
                     "-r", str(FPS), "-fps_mode", "cfr",
                     "-c:v", "libx264", "-crf", "21" if long_video else "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                     # A keyframe every second: the editor and the render jump to cut points fast.
                     "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
                     "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
                     "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
                     "-movflags", "+faststart", "-map_metadata", "-1"]
            if dur:
                args += ["-t", f"{dur:.3f}"]  # video and audio end together (AAC padding would add ~20 ms)
            args += ["-f", "mp4", tmp]
            last_err = run_ffmpeg_progress(args, dur, "proxy", fatal=False)
            if last_err is None:
                used = name + ("+hwdecode" if hw else "")
                break
            emit(info=f"video path {name}{' with hw decode' if hw else ''} failed, trying next: {last_err[-200:]}")
        if used:
            break
    if not used:
        fail(last_err or "proxy encode failed")
    os.replace(tmp, proxy)
    emit(info=f"video path used: {used}")

    wav = os.path.join(d, "audio16k.wav")
    aargs = ["-i", proxy, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]
    run_ffmpeg_progress(aargs, dur, "audio16k")

    pinfo = probe(proxy)
    pv = [s for s in pinfo["streams"] if s["codec_type"] == "video"][0]
    emit(done=True, proxy="proxy.mp4", audio="audio16k.wav", duration=round(duration_of(pinfo), 3),
         sourceDuration=round(dur, 3),
         source={"width": v.get("width"), "height": v.get("height"), "codec": v.get("codec_name"),
                 "rotation": rot, "hdr": hdr, "tonemap": used.split("+hwdecode")[0], "tonemapPath": used,
                 "crop": crop_mode, "fps": v.get("avg_frame_rate"), "hasAudio": has_audio},
         width=pv["width"], height=pv["height"], fps=pv["avg_frame_rate"])


if __name__ == "__main__":
    run_tool(main)
