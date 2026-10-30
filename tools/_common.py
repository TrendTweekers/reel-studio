"""Shared helpers for the Reel Studio analysis tools. Cross-platform (macOS arm64, Linux, Windows)."""
import glob
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "models")
IS_WIN = sys.platform == "win32"


def venv_python(venv_dir):
    """The python inside a venv folder (.venv, .venv-tts)."""
    return os.path.join(venv_dir, "Scripts", "python.exe") if IS_WIN else os.path.join(venv_dir, "bin", "python")


def _windows_guard():
    """Windows has no process groups. Put this tool in a job object that kills every child
    (ffmpeg) when the tool ends, and end the tool when the server that started it is gone,
    so a hard-killed server never leaves ffmpeg writing into a reel."""
    import ctypes
    import threading
    from ctypes import wintypes
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateJobObjectW.restype = wintypes.HANDLE
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    k32.OpenProcess.restype = wintypes.HANDLE
    k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    k32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]

    class BASIC(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                    ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                    ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                    ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]

    class IO(ctypes.Structure):
        _fields_ = [(n, ctypes.c_uint64) for n in ("r", "w", "o", "rt", "wt", "ot")]

    class EXT(ctypes.Structure):
        _fields_ = [("Basic", BASIC), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t),
                    ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t),
                    ("PeakJobMemoryUsed", ctypes.c_size_t)]

    job = k32.CreateJobObjectW(None, None)
    if job:
        info = EXT()
        info.Basic.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if k32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info)):  # Extended limits
            # Fails harmlessly when we already are in a job that forbids nesting; taskkill /t still works.
            k32.AssignProcessToJobObject(job, k32.GetCurrentProcess())
    # The server sets REEL_PARENT_PID: our direct parent is often the venv's python.exe launcher,
    # which outlives a killed server.
    try:
        ppid = int(os.environ.get("REEL_PARENT_PID") or os.getppid())
    except ValueError:
        ppid = os.getppid()
    parent = k32.OpenProcess(0x00100000, False, ppid)  # SYNCHRONIZE
    if parent:
        def watch():
            k32.WaitForSingleObject(parent, 0xFFFFFFFF)
            os._exit(3)
        threading.Thread(target=watch, daemon=True).start()


if IS_WIN:
    # Pipes are cp1252 on Windows; the server reads UTF-8 JSON lines (Polish words).
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    if not os.environ.get("REEL_NO_JOB_GUARD"):
        try:
            _windows_guard()
        except Exception:  # noqa: BLE001
            pass


def emit(**kw):
    print(json.dumps(kw, ensure_ascii=False), flush=True)


def progress(step, p):
    emit(step=step, progress=round(max(0.0, min(1.0, p)), 4))


def fail(msg, code=1):
    print(json.dumps({"error": str(msg)}, ensure_ascii=False), flush=True)
    sys.exit(code)


def run_tool(main):
    """Run main(); turn any exception into {"error": ...} + non-zero exit."""
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:  # noqa: BLE001
        fail(f"{type(e).__name__}: {e}")


def _win_ffmpeg_dirs():
    local = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    pf = os.environ.get("ProgramFiles") or r"C:\Program Files"
    return [os.path.join(local, "Microsoft", "WinGet", "Links"), os.path.join(pf, "ffmpeg", "bin"), r"C:\ffmpeg\bin"]


def _bin(name, env):
    if os.environ.get(env):
        return os.environ[env]
    d = os.environ.get("FFMPEG_BIN_DIR")
    if d:
        for cand in (name, name + ".exe"):
            p = os.path.join(d, cand)
            if os.path.exists(p):
                return p
    p = shutil.which(name)
    if not p and IS_WIN:
        p = next((os.path.join(x, name + ".exe") for x in _win_ffmpeg_dirs() if os.path.isfile(os.path.join(x, name + ".exe"))), None)
    if not p:
        fail(f"{name} not found. Put it on PATH or set {env} / FFMPEG_BIN_DIR.")
    return p


def ffmpeg():
    return _bin("ffmpeg", "FFMPEG")


def ffprobe():
    return _bin("ffprobe", "FFPROBE")


def probe(path):
    out = subprocess.run(
        [ffprobe(), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        fail(f"ffprobe failed on {path}: {out.stderr.strip()[-300:]}")
    return json.loads(out.stdout)


def duration_of(info):
    d = info.get("format", {}).get("duration")
    if d:
        return float(d)
    for s in info.get("streams", []):
        if s.get("duration"):
            return float(s["duration"])
    return 0.0


def project_arg(argv_dir):
    d = os.path.abspath(argv_dir)
    if not os.path.isdir(d):
        fail(f"project dir not found: {d}")
    return d


def find_source(d):
    c = [p for p in glob.glob(os.path.join(d, "source.*")) if os.path.isfile(p)]
    if not c:
        fail(f"no source.* file in {d}")
    return sorted(c)[0]


def need(d, name):
    p = os.path.join(d, name)
    if not os.path.isfile(p):
        fail(f"{name} not found in {d}. Run the earlier tool first (normalize.py).")
    return p


def write_json_atomic(path, obj, **kw):
    """Write JSON to <path>.tmp, then os.replace: a crash never leaves a half-written file."""
    tmp = path + ".tmp"
    kw.setdefault("ensure_ascii", False)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, **kw)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def perf_cores():
    """Number of performance cores (Apple Silicon: hw.perflevel0.physicalcpu), else os.cpu_count()."""
    if sys.platform == "darwin":
        try:
            out = subprocess.run(["sysctl", "-n", "hw.perflevel0.physicalcpu"], capture_output=True, text=True, timeout=5)
            n = int(out.stdout.strip())
            if n > 0:
                return n
        except Exception:  # noqa: BLE001
            pass
    return max(1, os.cpu_count() or 4)


_HW = {}


def hwaccel_args():
    """['-hwaccel', 'videotoolbox'] on macOS when a 0.3 s H.264 decode self-test works, else []. Cached."""
    if "decode" in _HW:
        return _HW["decode"]
    args = []
    if sys.platform == "darwin" and not os.environ.get("REEL_NO_HWACCEL"):
        import tempfile
        try:
            with tempfile.TemporaryDirectory() as td:
                clip = os.path.join(td, "t.mp4")
                subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i",
                                "testsrc2=s=320x240:d=0.4:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip],
                               capture_output=True, timeout=60, check=True)
                r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-hwaccel", "videotoolbox",
                                    "-i", clip, "-f", "null", "-"], capture_output=True, timeout=60)
                if r.returncode == 0:
                    args = ["-hwaccel", "videotoolbox"]
        except Exception:  # noqa: BLE001
            args = []
    _HW["decode"] = args
    emit(info="hwaccel decode: " + (args[1] if args else "software"))
    return args


def run_ffmpeg_progress(args, total, step, fatal=True):
    """Run ffmpeg with -progress and emit progress lines. total = expected output seconds.
    fatal=False returns the error text instead of exiting (None on success)."""
    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-progress", "pipe:1", "-nostats"] + args
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    last = 0.0
    for line in p.stdout:
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                us = int(line.split("=")[1])
            except ValueError:
                continue
            now = time.time()
            if total > 0 and now - last > 0.5:
                progress(step, us / 1e6 / total)
                last = now
    err = p.stderr.read()
    if p.wait() != 0:
        msg = f"ffmpeg failed ({step}): {err.strip()[-600:]}"
        if not fatal:
            return msg
        fail(msg)
    return None


def model_file(name, url):
    """Download a MediaPipe model into <root>/models if missing. Returns local path."""
    import urllib.request
    os.makedirs(MODELS_DIR, exist_ok=True)
    dst = os.path.join(MODELS_DIR, name)
    if not os.path.isfile(dst) or os.path.getsize(dst) < 10000:
        tmp = dst + ".part"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, dst)
    return dst
