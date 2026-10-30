#!/usr/bin/env python3
"""tts.py: computer voice (Chatterbox Multilingual V3, offline, MIT). Run with .venv-tts/bin/python.

  tts.py --check
      {"ready":true|false,"reason":"..."} fast, no model load (works with any Python 3).
  tts.py <project_dir> --text-file script.txt [--lang pl] [--sample her.m4a] [--out source.wav]
      Writes <project_dir>/source.wav (48 kHz mono, about -16 LUFS).
  tts.py --text "kilka słów" --out preview.wav [--sample her.m4a] [--lang pl]
      Quick preview line, no project dir.

Text: blank line = new paragraph (0.45 s pause), sentence end = 0.25 s pause. Each sentence is one
generation (long ones are cut at commas), so the model does not rush or invent words. A chunk whose
length is far off what its text needs is generated again with another seed.
--sample: her own voice, any format ffmpeg reads, 5 to 30 s (only the first 30 s are used).
Without it: the built-in voice for the language from models/tts/voices/ (CC0), else the model's own.
Progress lines: {"step":"load"|"voice"|"write","progress":0..1}. Last line: {"done":true,"duration":..,"file":..}.
"""
import argparse
import contextlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, ffmpeg, MODELS_DIR, ROOT, perf_cores

TTS_DIR = os.path.join(MODELS_DIR, "tts", "chatterbox")
VENV_PY = os.path.join(ROOT, ".venv-tts", "bin", "python")
INSTALL_MARK = os.path.join(ROOT, ".venv-tts", ".tts-install-ok")
T3_V3 = "t3_mtl23ls_v3.safetensors"
WEIGHTS = ["ve.pt", T3_V3, "s3gen.pt", "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "Cangjie5_TC.json"]

PAUSE_SENTENCE = 0.25
PAUSE_PARAGRAPH = 0.45
MAX_CHARS = 180      # one generation; longer sentences are cut at commas, then at spaces
MIN_CHARS = 18       # shorter sentences are joined with the next one (same paragraph)
TARGET_LUFS = -16.0
PEAK_DB = -2.0  # sample peak; leaves room for true peak after resampling
# Calm, natural delivery (not an announcer): low exaggeration, cfg 0.3 (slower, more deliberate; it
# also read the Polish words best in a side by side test), slightly lower temperature.
GEN = dict(exaggeration=0.4, cfg_weight=0.3, temperature=0.7, repetition_penalty=1.2, min_p=0.05, top_p=1.0)
SEED = 1234

os.environ.setdefault("HF_HOME", os.path.join(MODELS_DIR, "tts", "hf-home"))  # never ~/.cache
os.environ.setdefault("HF_HUB_OFFLINE", "1")  # weights are local; never call the network at run time
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def check():
    if not os.path.exists(VENV_PY):
        return False, "no .venv-tts: run tools/tts_setup.py"
    if not os.path.exists(INSTALL_MARK):
        return False, "packages not installed: run tools/tts_setup.py"
    missing = [f for f in WEIGHTS if not os.path.isfile(os.path.join(TTS_DIR, f))]
    if missing or not os.path.exists(os.path.join(TTS_DIR, ".download-ok")):
        return False, "model weights missing in models/tts/chatterbox: run tools/tts_setup.py"
    return True, "ok"


# ---------------------------------------------------------------- text

ABBREV = {"np", "tzn", "itd", "itp", "m.in", "tj", "ok", "godz", "ul", "al", "dr", "prof", "mgr", "inż", "św",
          "r", "w", "wg", "ds", "nr", "str", "tel", "zob", "por", "jw", "pt", "ang", "łac", "tys", "mln", "mld", "min",
          "maks", "cd", "pn", "wt", "śr", "czw", "pt", "sob", "ndz", "im", "gen", "płk", "ks", "o"}
SENT_END = re.compile(r'([.!?…]+["»”’)]*)\s+(?=["«„“(]?[A-ZĄĆĘŁŃÓŚŹŻ0-9])')


def clean(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace(" ", " ").replace("’", "'").replace("„", '"').replace("”", '"')
    text = text.replace("—", ", ").replace("–", ", ").replace("...", "…")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def sentences(par):
    """Split one paragraph at sentence ends, but not after Polish abbreviations (np., tzn., m.in.)."""
    out, start = [], 0
    for m in SENT_END.finditer(par):
        before = par[start:m.start()].rstrip()
        word = before.split(" ")[-1].lower() if before else ""
        if m.group(1) == "." and word.strip("(\"„") in ABBREV:
            continue
        out.append(par[start:m.end(1)].strip())
        start = m.end()
    rest = par[start:].strip()
    if rest:
        out.append(rest)
    return [s for s in out if re.search(r"\w", s)]


def cut_long(s):
    if len(s) <= MAX_CHARS:
        return [s]
    parts, cur = [], ""
    for piece in re.split(r"(?<=[,;:])\s+", s):
        if cur and len(cur) + 1 + len(piece) > MAX_CHARS:
            parts.append(cur)
            cur = piece
        else:
            cur = (cur + " " + piece).strip()
    if cur:
        parts.append(cur)
    out = []
    for p in parts:  # still too long (no commas): cut at spaces
        while len(p) > MAX_CHARS:
            k = p.rfind(" ", 0, MAX_CHARS)
            k = k if k > 40 else MAX_CHARS
            out.append(p[:k].strip())
            p = p[k:].strip()
        if p:
            out.append(p)
    return out


def plan(text):
    """[(chunk_text, pause_after_seconds)]"""
    chunks = []
    pars = [p.strip() for p in re.split(r"\n\s*\n", clean(text)) if p.strip()]
    for pi, par in enumerate(pars):
        par = re.sub(r"\s*\n\s*", " ", par)
        items = []
        for s in sentences(par):
            items.extend(cut_long(s))
        merged = []
        for it in items:
            if merged and len(merged[-1]) < MIN_CHARS and len(merged[-1]) + 1 + len(it) <= MAX_CHARS:
                merged[-1] = merged[-1] + " " + it
            else:
                merged.append(it)
        if len(merged) > 1 and len(merged[-1]) < MIN_CHARS and len(merged[-2]) + 1 + len(merged[-1]) <= MAX_CHARS:
            merged[-2] = merged[-2] + " " + merged.pop()
        for si, ch in enumerate(merged):
            last_in_par = si == len(merged) - 1
            chunks.append([ch, PAUSE_PARAGRAPH if last_in_par else PAUSE_SENTENCE])
    if chunks:
        chunks[-1][1] = 0.0
    return [tuple(c) for c in chunks]


# ---------------------------------------------------------------- audio

def run_ff(args, what):
    r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y"] + args,
                       capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"ffmpeg failed ({what}): {r.stderr.strip()[-400:]}")


def prepare_sample(path, td):
    """Any format -> 24 kHz mono wav, first 30 s, loudness evened out. Fails if under 3 s of audio."""
    if not os.path.isfile(path):
        fail(f"sample not found: {path}")
    out = os.path.join(td, "sample24k.wav")
    run_ff(["-i", path, "-t", "30", "-vn", "-ac", "1", "-ar", "24000",
            "-af", "highpass=f=70,loudnorm=I=-20:TP=-2:LRA=11", "-c:a", "pcm_s16le", out], "sample")
    import soundfile as sf
    info = sf.info(out)
    if info.duration < 3.0:
        fail(f"sample is too short ({info.duration:.1f} s). Record 5 to 30 s of normal speech.")
    if info.duration < 5.0:
        emit(warning=f"sample is short ({info.duration:.1f} s); 10 to 20 s gives a closer voice")
    return out


def trim(wav, sr, top_db=40):
    """Cut silence at both ends, keep 30 ms, 10 ms fades (no clicks)."""
    import numpy as np
    import librosa
    if wav.size == 0:
        return wav
    _, (a, b) = librosa.effects.trim(wav, top_db=top_db, frame_length=1024, hop_length=256)
    pad = int(0.03 * sr)
    w = wav[max(0, a - pad):min(len(wav), b + pad)].copy()
    f = min(int(0.01 * sr), len(w) // 2)
    if f > 0:
        ramp = np.linspace(0.0, 1.0, f, dtype=w.dtype)
        w[:f] *= ramp
        w[-f:] *= ramp[::-1]
    return w


def expected_seconds(text):
    # Calm Polish speech: about 13 letters per second, plus a little for commas.
    letters = len(re.sub(r"[^\wąćęłńóśźż]", "", text.lower()))
    return letters / 13.0 + 0.15 * text.count(",") + 0.2


def pick_device():
    import torch
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _stream_load(module, path):
    """Copy a .safetensors file into the module one tensor at a time. ChatterboxMultilingualTTS.from_local
    reads the whole 2.1 GB file and then copies it, so RAM peaks at twice the model size."""
    from safetensors import safe_open
    params = module.state_dict(keep_vars=True)
    seen = set()
    with safe_open(path, framework="pt", device="cpu") as f:
        for k in f.keys():
            if k not in params:
                raise RuntimeError(f"unexpected weight {k} in {os.path.basename(path)}")
            params[k].data.copy_(f.get_tensor(k))
            seen.add(k)
    missing = set(params) - seen
    if missing:
        raise RuntimeError(f"{len(missing)} weights missing in {os.path.basename(path)}, e.g. {sorted(missing)[:3]}")


def load_model(device):
    """Same result as ChatterboxMultilingualTTS.from_local(TTS_DIR, device, t3_model=V3), with a lower RAM peak."""
    import gc
    import logging
    import torch
    logging.getLogger("chatterbox.models.tokenizers.tokenizer").setLevel(logging.ERROR)  # zh/ja helpers we do not ship
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals
    from chatterbox.models.t3 import T3
    from chatterbox.models.t3.modules.t3_config import T3Config
    from chatterbox.models.s3gen import S3Gen
    from chatterbox.models.tokenizers import MTLTokenizer
    from chatterbox.models.voice_encoder import VoiceEncoder
    torch.set_num_threads(perf_cores())
    cpu = torch.device("cpu")
    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(os.path.join(TTS_DIR, "ve.pt"), map_location=cpu, weights_only=True))
    ve.to(device).eval()
    t3 = T3(T3Config.multilingual())
    _stream_load(t3, os.path.join(TTS_DIR, T3_V3))
    t3.to(device).eval()
    gc.collect()
    s3gen = S3Gen()
    sd = torch.load(os.path.join(TTS_DIR, "s3gen.pt"), map_location=cpu, weights_only=True, mmap=True)
    s3gen.load_state_dict(sd)
    del sd
    s3gen.to(device).eval()
    gc.collect()
    tok = MTLTokenizer(os.path.join(TTS_DIR, "grapheme_mtl_merged_expanded_v1.json"))
    conds = Conditionals.load(os.path.join(TTS_DIR, "conds.pt"), map_location="cpu").to(device)
    import contextlib
    with contextlib.redirect_stdout(sys.stderr):  # perth prints "loaded PerthNet": stdout is JSON only
        return ChatterboxMultilingualTTS(t3, s3gen, ve, tok, device, conds=conds)


def generate_chunk(model, text, lang):
    """Generate one chunk; retry with other seeds when its length shows a rush, a cut or extra words."""
    import torch
    exp = expected_seconds(text)
    best = None
    for attempt in range(3):
        torch.manual_seed(SEED + attempt * 7919)
        with contextlib.redirect_stdout(sys.stderr):
            wav = model.generate(text, language_id=lang, **GEN).squeeze(0).cpu().numpy()
        w = trim(wav, model.sr)
        dur = len(w) / model.sr
        ratio = dur / exp if exp > 0 else 1.0
        score = abs(ratio - 1.0)
        if best is None or score < best[0]:
            best = (score, w, ratio)
        if 0.6 <= ratio <= 1.7:
            break
        log(f"chunk off length (ratio {ratio:.2f}, attempt {attempt + 1}): {text[:60]}")
    if not 0.5 <= best[2] <= 2.0:
        emit(warning=f"chunk may be cut or have extra sounds (length ratio {best[2]:.2f}): {text[:60]}")
    return best[1]


def finish(wav, sr, out_path, td):
    """Loudness to about -16 LUFS, a soft limiter keeps peaks under -2 dBFS, then 48 kHz 16 bit mono WAV."""
    import numpy as np
    import pyloudnorm as pyln
    import soundfile as sf
    wav = wav.astype(np.float64)
    gain_db = 0.0
    if len(wav) > sr * 0.5:
        lufs = pyln.Meter(sr).integrated_loudness(wav)
        if np.isfinite(lufs):
            gain_db = TARGET_LUFS - lufs
    gain_db = max(-20.0, min(gain_db, 24.0))
    wav = wav * (10 ** (gain_db / 20))
    raw = os.path.join(td, "raw.wav")
    sf.write(raw, wav.astype(np.float32), sr, subtype="FLOAT")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    tmp = out_path + ".tmp.wav"
    run_ff(["-i", raw, "-af", f"alimiter=limit={10 ** (PEAK_DB / 20):.3f}:attack=5:release=60:level=disabled,"
            "aresample=48000:resampler=soxr", "-ar", "48000", "-ac", "1",
            "-c:a", "pcm_s16le", tmp], "write")
    os.replace(tmp, out_path)
    return len(wav) / sr


def synthesize(text, lang, sample, out_path):
    import numpy as np
    chunks = plan(text)
    if not chunks:
        fail("the text is empty")
    log(f"{len(chunks)} chunks: " + json.dumps([c[0] for c in chunks], ensure_ascii=False))
    t0 = time.time()
    with tempfile.TemporaryDirectory(prefix="reel-tts-") as td:
        sample24 = prepare_sample(sample, td) if sample else None
        progress("load", 0.0)
        device = pick_device()
        model = load_model(device)
        if sample24:
            model.prepare_conditionals(sample24, exaggeration=GEN["exaggeration"])
        progress("load", 1.0)
        emit(info=f"device {device}, {len(chunks)} chunks")
        total_chars = sum(len(c[0]) for c in chunks)
        done_chars = 0
        parts = []
        for i, (ch, pause) in enumerate(chunks):
            try:
                w = generate_chunk(model, ch, lang)
            except Exception as e:  # noqa: BLE001
                if device != "mps":
                    raise
                # Some torch ops are still flaky on Apple GPUs: finish on the CPU instead.
                emit(warning=f"mps failed ({type(e).__name__}); using cpu")
                device = "cpu"
                del model
                import gc
                gc.collect()
                model = load_model(device)
                if sample24:
                    model.prepare_conditionals(sample24, exaggeration=GEN["exaggeration"])
                w = generate_chunk(model, ch, lang)
            parts.append(w)
            if pause > 0:
                parts.append(np.zeros(int(pause * model.sr), dtype=w.dtype))
            done_chars += len(ch)
            progress("voice", done_chars / total_chars)
        progress("write", 0.0)
        wav = np.concatenate(parts)
        dur = finish(wav, model.sr, out_path, td)
        progress("write", 1.0)
    gen_s = time.time() - t0
    return dur, gen_s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project_dir", nargs="?")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--text-file")
    ap.add_argument("--text")
    ap.add_argument("--lang", default="pl")
    ap.add_argument("--sample")
    ap.add_argument("--out")
    a = ap.parse_args()

    if a.check:
        ready, reason = check()
        emit(ready=ready, reason=reason)
        return
    ready, reason = check()
    if not ready:
        fail(reason)

    if a.text is not None:
        text = a.text
    elif a.text_file:
        if not os.path.isfile(a.text_file):
            fail(f"text file not found: {a.text_file}")
        with open(a.text_file, encoding="utf-8-sig") as f:
            text = f.read()
    else:
        fail("give --text-file <path> or --text \"...\"")

    if a.project_dir:
        d = os.path.abspath(a.project_dir)
        if not os.path.isdir(d):
            fail(f"project dir not found: {d}")
        out_name = a.out or "source.wav"
        out_path = out_name if os.path.isabs(out_name) else os.path.join(d, out_name)
        shown = os.path.relpath(out_path, d) if out_path.startswith(d + os.sep) else out_path
    else:
        if not a.out:
            fail("give --out <file.wav> (or a project dir)")
        out_path = os.path.abspath(a.out)
        shown = out_path

    from chatterbox.mtl_tts import SUPPORTED_LANGUAGES
    lang = (a.lang or "pl").lower()
    if lang not in SUPPORTED_LANGUAGES:
        fail(f"language {lang} not supported; use one of {', '.join(sorted(SUPPORTED_LANGUAGES))}")

    # No sample of her own: the built-in voice for the language (CC0 recordings from tts_setup.py).
    # English keeps the model's own English reference.
    sample = a.sample
    if not sample:
        builtin = os.path.join(MODELS_DIR, "tts", "voices", f"{lang}-f.mp3")
        if os.path.isfile(builtin):
            sample = builtin
            emit(info="built-in voice " + os.path.basename(builtin))
    dur, gen_s = synthesize(text, lang, sample, out_path)
    emit(done=True, duration=round(dur, 2), file=shown, seconds=round(gen_s, 1),
         rtf=round(gen_s / dur, 2) if dur else None)


if __name__ == "__main__":
    run_tool(main)
