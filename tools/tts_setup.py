#!/usr/bin/env python3
"""tts_setup.py  ->  .venv-tts (Chatterbox Multilingual V3) + models/tts/chatterbox

Run with any system Python 3.10 to 3.12 (macOS: Homebrew python3.12). Safe to run again: it skips a
finished install and resumes a broken download. Prints JSON lines: {"step":"venv|install|download|verify",
"progress":0..1}, then {"done":true,...}. Errors: {"error":"..."} and exit 1.

Why a separate venv: torch and transformers must never change the packages in .venv (faster-whisper,
mediapipe). On Linux torch comes from the CPU-only index (saves about 4 GB of CUDA files).
Options: --force-install (reinstall packages), --skip-download.
"""
import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, ROOT, MODELS_DIR, IS_WIN, venv_python

VENV = os.path.join(ROOT, ".venv-tts")
VPY = venv_python(VENV)
REQ = os.path.join(ROOT, "tools", "requirements-tts.txt")
MARK = os.path.join(VENV, ".tts-install-ok")
TTS_DIR = os.path.join(MODELS_DIR, "tts", "chatterbox")
REPO_ID = "ResembleAI/chatterbox"
REVISION = "main"
# Multilingual V3 (t3_mtl23ls_v3) + the shared parts. Same list as tts.py WEIGHTS.
FILES = ["ve.pt", "t3_mtl23ls_v3.safetensors", "s3gen.pt", "grapheme_mtl_merged_expanded_v1.json",
         "conds.pt", "Cangjie5_TC.json"]
TORCH_CPU_INDEX = "https://download.pytorch.org/whl/cpu"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def ok_python(exe):
    try:
        out = subprocess.run([exe, "-c", "import sys,venv;print('%d.%d' % sys.version_info[:2])"],
                             capture_output=True, text=True, timeout=30)
    except Exception:  # noqa: BLE001
        return None
    if out.returncode != 0:
        return None
    v = out.stdout.strip()
    try:
        major, minor = (int(x) for x in v.split("."))
    except ValueError:
        return None
    return v if major == 3 and 10 <= minor <= 12 else None


def find_python():
    """Python 3.10 to 3.12 for the venv (numpy 1.26 + torch 2.6 have wheels there). Homebrew 3.12 first,
    like install.sh, then this Python, then others on PATH."""
    cands = []
    if os.environ.get("REEL_TTS_PYTHON"):
        cands.append(os.environ["REEL_TTS_PYTHON"])
    for brew in ("/opt/homebrew/opt/python@3.12/bin/python3.12", "/usr/local/opt/python@3.12/bin/python3.12"):
        cands.append(brew)
    if IS_WIN:
        local = os.environ.get("LOCALAPPDATA") or os.path.expanduser(r"~\AppData\Local")
        cands += [os.path.join(local, "Programs", "Python", f"Python31{m}", "python.exe") for m in (2, 1, 0)]
    cands.append(sys.executable)
    for n in ("python3.12", "python3.11", "python3.10", "python3", "python"):
        p = shutil.which(n)
        if p:
            cands.append(p)
    for c in cands:
        if c and os.path.exists(c) and ok_python(c):
            return c
    fail("No Python 3.10 to 3.12 found. On a Mac run: brew install python@3.12; on Windows: winget install Python.Python.3.12")


def req_hash():
    h = hashlib.sha256()
    with open(REQ, "rb") as f:
        h.update(f.read())
    h.update(sys.platform.encode())
    return h.hexdigest()[:16]


def read_requirements():
    """Lines before '#@no-deps' install normally, lines after it with --no-deps."""
    normal, nodeps, cur = [], [], None
    cur = normal
    with open(REQ, encoding="utf-8") as f:
        for ln in f:
            s = ln.strip()
            if s.startswith("#@no-deps"):
                cur = nodeps
                continue
            if not s or s.startswith("#"):
                continue
            cur.append(s)
    return normal, nodeps


def pip(args, lo, hi, expect):
    """Run pip, print its output to stderr, and map 'Collecting'/'Downloading' lines to progress lo..hi."""
    cmd = [VPY, "-m", "pip", "--disable-pip-version-check", "--no-input"] + args
    log("$ " + " ".join(cmd))
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    seen = 0
    last = 0.0
    tail = []
    for line in p.stdout:
        log(line.rstrip())
        tail = (tail + [line.rstrip()])[-15:]
        if line.startswith(("Collecting", "Requirement already satisfied", "Downloading", "Using cached")):
            seen += 1
            now = time.time()
            if now - last > 0.5:  # at most 2 lines per second
                last = now
                progress("install", lo + (hi - lo) * min(0.95, seen / max(1, expect)))
    if p.wait() != 0:
        fail("pip failed: " + " | ".join(tail[-6:]))
    progress("install", hi)


def make_venv(py):
    if os.path.exists(VPY):
        r = subprocess.run([VPY, "-c", "import pip"], capture_output=True)
        if r.returncode == 0:
            return
        log("broken .venv-tts (no pip): making it again")
        shutil.rmtree(VENV)
    progress("venv", 0.0)
    r = subprocess.run([py, "-m", "venv", VENV], capture_output=True, text=True)
    if r.returncode != 0:
        # Debian/Ubuntu Python without ensurepip: use uv when it is there.
        shutil.rmtree(VENV, ignore_errors=True)
        uv = shutil.which("uv") or os.path.expanduser("~/.local/bin/uv")
        if not os.path.exists(uv):
            fail("python -m venv failed (" + r.stderr.strip()[-200:] + "). Install python3-venv or uv.")
        r = subprocess.run([uv, "venv", "--python", py, "--seed", VENV], capture_output=True, text=True)
        if r.returncode != 0:
            fail("uv venv failed: " + r.stderr.strip()[-300:])
    progress("venv", 1.0)


def install(force):
    if not force and os.path.exists(MARK):
        with open(MARK) as f:
            if f.read().strip() == req_hash():
                progress("install", 1.0)
                return False
    normal, nodeps = read_requirements()
    progress("install", 0.0)
    pip(["install", "--upgrade", "pip"], 0.0, 0.03, 2)
    torch_pkgs = [r for r in normal if r.split("==")[0].lower() in ("torch", "torchaudio")]
    rest = [r for r in normal if r not in torch_pkgs]
    if sys.platform.startswith("linux"):
        # CPU-only wheels: about 0.8 GB instead of 5 GB with CUDA (no GPU in WSL tests or on most PCs).
        pip(["install", "--index-url", TORCH_CPU_INDEX] + torch_pkgs, 0.03, 0.45, 12)
    else:
        pip(["install"] + torch_pkgs, 0.03, 0.45, 12)
    # Torch is pinned (==2.6.0 also matches 2.6.0+cpu), so this step never swaps it for a CUDA build.
    pip(["install"] + rest, 0.45, 0.9, len(rest) * 2)
    pip(["install", "--no-deps"] + nodeps, 0.9, 1.0, len(nodeps))
    with open(MARK, "w") as f:
        f.write(req_hash())
    return True


def dir_size(d):
    t = 0
    for base, _, files in os.walk(d):
        for n in files:
            try:
                t += os.path.getsize(os.path.join(base, n))
            except OSError:
                pass
    return t


def download():
    """Download the weights into models/tts/chatterbox with huggingface_hub (resumes .incomplete files).
    Runs inside .venv-tts. HF_HOME points into models/tts so nothing lands in ~/.cache."""
    ok_mark = os.path.join(TTS_DIR, ".download-ok")
    if os.path.exists(ok_mark) and all(os.path.isfile(os.path.join(TTS_DIR, f)) for f in FILES):
        progress("download", 1.0)
        return False
    os.makedirs(TTS_DIR, exist_ok=True)
    env = dict(os.environ, HF_HOME=os.path.join(MODELS_DIR, "tts", "hf-home"), HF_HUB_DISABLE_TELEMETRY="1",
               HF_HUB_DISABLE_PROGRESS_BARS="1", PYTHONUNBUFFERED="1")
    code = r"""
import json, sys
from huggingface_hub import HfApi, hf_hub_download
repo, rev, out, files = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(",")
try:
    info = HfApi().model_info(repo, revision=rev, files_metadata=True)
    sizes = {s.rfilename: (s.size or 0) for s in info.siblings if s.rfilename in files}
except Exception as e:
    sizes = {}
print(json.dumps({"total": sum(sizes.values())}), flush=True)
for f in files:
    hf_hub_download(repo, f, revision=rev, local_dir=out)
    print(json.dumps({"file": f}), flush=True)
"""
    p = subprocess.Popen([VPY, "-c", code, REPO_ID, REVISION, TTS_DIR, ",".join(FILES)], env=env,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    total = [0]
    stop = threading.Event()

    def poll():
        while not stop.wait(1.0):
            if total[0] > 0:
                progress("download", dir_size(TTS_DIR) / total[0])

    th = threading.Thread(target=poll, daemon=True)
    th.start()
    import json
    for line in p.stdout:
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if "total" in msg:
            total[0] = msg["total"]
        elif "file" in msg:
            log("downloaded " + msg["file"])
    err = p.stderr.read()
    stop.set()
    if p.wait() != 0:
        fail("download failed (run again to resume): " + err.strip()[-400:])
    missing = [f for f in FILES if not os.path.isfile(os.path.join(TTS_DIR, f))]
    if missing:
        fail("download incomplete: " + ", ".join(missing))
    with open(ok_mark, "w") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S"))
    progress("download", 1.0)
    return True


def verify():
    progress("verify", 0.0)
    code = ("import torch, perth, chatterbox.mtl_tts as m; "
            "assert perth.PerthImplicitWatermarker is not None, 'perth watermarker did not import'; "
            "assert 'v3' in m.MULTILINGUAL_T3_MODELS, 'chatterbox without V3'; "
            "print(torch.__version__, torch.backends.mps.is_available())")
    env = dict(os.environ, HF_HOME=os.path.join(MODELS_DIR, "tts", "hf-home"), HF_HUB_OFFLINE="1")
    r = subprocess.run([VPY, "-c", code], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        fail("import test failed: " + r.stderr.strip()[-400:])
    progress("verify", 1.0)
    return r.stdout.strip()


# Built-in voices: short CC0 (public domain) recordings from Nabu Casa's voice datasets
# (github.com/OHF-Voice/voice-datasets). Without them the model speaks Polish with an English accent.
VOICES = {
    "pl-f": "https://raw.githubusercontent.com/OHF-Voice/voice-datasets/master/pl_PL/gosia/0000000001.mp3",
    "pl-m": "https://raw.githubusercontent.com/OHF-Voice/voice-datasets/master/pl_PL/darkman/0000000001.mp3",
}
VOICES_DIR = os.path.join(MODELS_DIR, "tts", "voices")


def download_voices():
    import urllib.request
    os.makedirs(VOICES_DIR, exist_ok=True)
    for name, url in VOICES.items():
        out = os.path.join(VOICES_DIR, name + ".mp3")
        if os.path.isfile(out) and os.path.getsize(out) > 20000:
            continue
        try:
            with urllib.request.urlopen(url, timeout=60) as r, open(out + ".part", "wb") as f:
                shutil.copyfileobj(r, f)
            os.replace(out + ".part", out)
            log("downloaded voice " + name)
        except Exception as e:  # noqa: BLE001
            emit(warning=f"built-in voice {name} not downloaded ({e}); her own sample still works")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force-install", action="store_true")
    ap.add_argument("--skip-download", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    py = find_python()
    emit(info="python " + py)
    make_venv(py)
    installed = install(a.force_install)
    downloaded = False if a.skip_download else download()
    if not a.skip_download:
        download_voices()
    torch_info = verify()
    emit(done=True, installed=installed, downloaded=downloaded, torch=torch_info,
         seconds=round(time.time() - t0, 1), venv=".venv-tts", models="models/tts/chatterbox")


if __name__ == "__main__":
    run_tool(main)
