# Reel Studio analysis tools

Python 3.12. Every tool is a CLI: `python tools/<name>.py <project_dir> [options]`.
It prints JSON lines on stdout: `{"step":"...","progress":0..1}` while working, and a last line
`{"done":true,...}`. On failure it prints `{"error":"..."}` and exits non-zero. Library noise (MediaPipe,
Hugging Face) goes to stderr only, so stdout is always one JSON object per line.

Setup (macOS arm64 or Linux): `python3.12 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt`
(or `uv venv .venv --python 3.12 --seed && uv pip install -p .venv/bin/python -r tools/requirements.txt`).
`ffmpeg` and `ffprobe` are found via env `FFMPEG` / `FFPROBE`, else dir `FFMPEG_BIN_DIR`, else `PATH`.
It needs libx264, libvpx-vp9 and aac. `zscale` is used for HDR if present.
Models download on first use into `<root>/models` (Whisper from Hugging Face, MediaPipe from storage.googleapis.com).

| Tool | Reads | Writes | Notes |
|---|---|---|---|
| `normalize.py` | `source.*` | `proxy.mp4`, `audio16k.wav` | 1080x1920, 30 fps CFR, H.264 crf 18, AAC 48k stereo, faststart. Handles HEVC, rotation, VFR, no audio track. Audio starts at 0 like the video. Chain order: fps, scale/crop, then HDR tone map. HDR/HLG/Dolby Vision paths tried in order (each self-tested, path used is in `tonemap`): VideoToolbox (macOS), zscale+hable, libplacebo, `lut-hable` (works in plain Homebrew ffmpeg). Landscape: crop around the median face x of about 10 frames. macOS: `-hwaccel videotoolbox` decode with self-test and fallback. Final line has `duration`. |
| `transcribe.py [--model M] [--language pl\|en\|auto]` | `audio16k.wav` | `words.json`, `transcript.json` | faster-whisper, CPU int8 (`cpu_threads` = performance cores), word timestamps, pause-split chunks with prompt + vocabulary. Drops segments with no_speech_prob > 0.6 or avg_logprob < -1 and known hallucination phrases; no speech at all gives empty words; language probability < 0.7 gives `pl`. Default model env `REEL_WHISPER_MODEL` or `large-v3-turbo` (about 1.6 GB, first run downloads it). |
| `faces.py [--every 0.2]` | `proxy.mp4` | `faces.json` | MediaPipe FaceDetector (short range; small faces: retried on an upscaled top crop). Streams frames (constant RAM). Follows one person (switch after 5 samples). Gaps hold the last box; gaps of 1 s or more add `"lost": true`. Empty array and a `warning` if no face. |
| `cutout.py [--fps 30] [--crf 30]` | `proxy.mp4` | `cutout.webm` | MediaPipe selfie_segmenter on 256 px wide frames at 15 fps (interpolated to 30), masks piped into one ffmpeg that upscales, softens and alphamerges; VP9 realtime + alpha, no audio. About 5x less CPU than before. Progress: `segment`, then `encode`. |
| `gen_sfx.py` | none | `assets/sfx/*.wav` | Synthesizes the 10 original sound effects (48 kHz, 16 bit, mono). Already run; re-run only to regenerate. |

Server order: `normalize` first, then `transcribe`, `faces`, `cutout` (the last three are independent and can run in parallel).
Example: `PATH=... .venv/bin/python tools/normalize.py projects/<slug>`.

All JSON outputs are written to a `.tmp` file and renamed (atomic). Changes: `audit/tools-fixes.md`.
