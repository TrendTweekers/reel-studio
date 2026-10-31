# Klipownia analysis tools

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

## Computer voice (separate venv)

Chatterbox Multilingual V3 (Resemble AI, MIT code and weights), offline, Polish and 22 other languages,
optional voice cloning from a short sample. It lives in its own venv `.venv-tts` so torch never changes `.venv`.

| Tool | Reads | Writes | Notes |
|---|---|---|---|
| `tts_setup.py [--force-install] [--skip-download]` | `tools/requirements-tts.txt` | `.venv-tts/`, `models/tts/chatterbox/` | Run with a system Python 3.10 to 3.12 (macOS: Homebrew `python3.12`). Linux gets CPU-only torch, macOS normal torch (MPS). Weights (about 3.1 GB) go into `models/tts`, never `~/.cache`. Safe to run again: skips a finished install (hash of the requirements file) and resumes a broken download. Steps: `venv`, `install`, `download`, `verify`. |
| `tts.py --check` | none | none | `{"ready":true\|false,"reason":"..."}`, no model load, works with any Python 3. |
| `tts.py <project_dir> --text-file F [--lang pl] [--sample S] [--out source.wav]` | text file, sample | `source.wav` | Run with `.venv-tts/bin/python`. One generation per sentence (long ones cut at commas, very short ones joined), retried with another seed if its length is far off. 0.25 s pause between sentences, 0.45 s between paragraphs (blank line), ends trimmed, about -16 LUFS, 48 kHz 16 bit mono. `--sample`: her voice, any ffmpeg format, 5 to 30 s. Device cuda, else mps (falls back to cpu on an error), else cpu. Progress: `load`, `voice` (per chunk), `write`. Last line: `{"done":true,"duration":..,"file":"source.wav","seconds":..,"rtf":..}`. |
| `tts.py --text "..." --out F.wav [--sample S] [--lang pl]` | none | `F.wav` | Quick preview line, no project dir. |

Every output has Resemble's inaudible Perth watermark (marks it as AI audio). Use only one TTS job at a time: the model needs about 3 GB RAM.

All JSON outputs are written to a `.tmp` file and renamed (atomic). Changes: `audit/tools-fixes.md`.

Built-in voices: `tts_setup.py` also downloads two short CC0 Polish recordings (Nabu Casa voice datasets, public domain) into `models/tts/voices/` (`pl-f.mp3` female, `pl-m.mp3` male). Without `--sample`, `tts.py` clones `<lang>-f.mp3` when it exists, so Polish has no English accent. English uses the model's own voice.
