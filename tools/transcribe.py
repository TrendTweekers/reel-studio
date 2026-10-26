#!/usr/bin/env python3
"""transcribe.py <project_dir> [--model M] [--language pl|en|auto]  ->  words.json + transcript.json

faster-whisper (CTranslate2), CPU int8 on every platform (no Metal in faster-whisper).
Default model: env REEL_WHISPER_MODEL or "large-v3-turbo" (= mobiuslabsgmbh/faster-whisper-large-v3-turbo).
Models are cached in <root>/models.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import emit, progress, fail, run_tool, project_arg, need, probe, duration_of, MODELS_DIR, perf_cores, write_json_atomic


# Phrases Whisper writes on silence/music (learned from its training subtitles), even with a confident score.
HALLUCINATIONS = ("dzięki za oglądanie", "dziękuję za oglądanie", "dziękuję za uwagę", "napisy stworzone", "napisy wykonał", "amara.org",
                  "subskrybuj", "thanks for watching", "thank you for watching", "subtitles by")


def load_vocabulary():
    """vocabulary.txt in the app folder: one term per line, # starts a comment."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vocabulary.txt")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [ln.strip() for ln in f if ln.strip() and not ln.lstrip().startswith("#")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project_dir")
    ap.add_argument("--model", default=os.environ.get("REEL_WHISPER_MODEL") or "large-v3-turbo")
    ap.add_argument("--language", default="auto")
    ap.add_argument("--beam-size", type=int, default=5)
    a = ap.parse_args()
    d = project_arg(a.project_dir)
    wav = need(d, "audio16k.wav")
    dur = duration_of(probe(wav))
    lang = None if a.language in ("auto", "", None) else a.language

    progress("load-model", 0.0)
    from faster_whisper import WhisperModel
    os.makedirs(MODELS_DIR, exist_ok=True)
    threads = perf_cores()  # CTranslate2 default is 4; the number of performance cores is faster on Apple Silicon
    model = WhisperModel(a.model, device="cpu", compute_type="int8", download_root=MODELS_DIR, cpu_threads=threads)
    progress("load-model", 1.0)

    import wave
    import numpy as np
    with wave.open(wav, "rb") as wf:  # our own 16 kHz mono s16 file; avoids PyAV's decoder entirely
        audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
    # Her own words (vocabulary.txt: fashion terms, brand names, one per line) guide the model, and a
    # short, well punctuated Polish prompt keeps punctuation on, which the hooks and captions need.
    vocab = load_vocabulary()
    prompt = None
    if lang in (None, "pl"):
        prompt = "Cześć, dziewczyny! Dziś pokażę Wam moje jesienne stylizacje."
        if vocab:
            prompt += " Słowa: " + ", ".join(vocab[:60]) + "."
    # Whisper only sees the prompt in its first 30 s window. So we cut the audio at her own pauses into
    # pieces under 28 s and give every piece the prompt: punctuation and her words hold for the whole
    # video, without "condition on previous text", which invents repeated sentences.
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    sr = 16000
    speech = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=300, speech_pad_ms=150))
    chunks = []
    for sp in speech:
        if chunks and sp["end"] - chunks[-1][0] <= 28 * sr:
            chunks[-1][1] = sp["end"]
        else:
            chunks.append([sp["start"], sp["end"]])
    if not chunks:
        # The voice detector heard no speech at all (music, noise, silence). Whisper would invent words
        # ("Dzięki za oglądanie!") on such audio, so write an empty transcript instead.
        emit(warning="no speech found in the audio")
        write_json_atomic(os.path.join(d, "words.json"), [], indent=1)
        write_json_atomic(os.path.join(d, "transcript.json"),
                          {"language": "pl" if lang is None else lang, "text": "", "duration": round(dur, 3)}, indent=1)
        emit(done=True, words=0, language="pl" if lang is None else lang, languageProbability=0.0,
             model=a.model, duration=round(dur, 3), droppedSegments=0, cpuThreads=threads, noSpeech=True)
        return
    # Language: auto-detect on the first piece. Below 0.7 probability it is almost always noise or music
    # on a Polish video, so use Polish (a wrong "en" would give an English edit language).
    lang_prob = 1.0
    if lang is None:
        c0, c1 = chunks[0]
        try:
            dl, lang_prob, _ = model.detect_language(audio=audio[c0:min(c1, c0 + 30 * sr)])
            lang = dl if lang_prob >= 0.7 else "pl"
        except Exception as e:  # noqa: BLE001
            emit(warning=f"language detection failed ({type(e).__name__}); using pl")
            lang = "pl"
        if lang == "pl":
            prompt = prompt or ("Cześć, dziewczyny! Dziś pokażę Wam moje jesienne stylizacje."
                                + (" Słowa: " + ", ".join(vocab[:60]) + "." if vocab else ""))
    language = lang
    words, texts, dropped = [], [], 0
    for ci, (c0, c1) in enumerate(chunks):
        c0 = max(0, c0 - int(0.1 * sr))
        c1 = min(len(audio), c1 + int(0.1 * sr))
        offset = c0 / sr
        segments, info = model.transcribe(
            audio[c0:c1], language=language, word_timestamps=True, vad_filter=False,
            beam_size=a.beam_size, condition_on_previous_text=False,
            initial_prompt=prompt, hotwords=" ".join(vocab[:60]) or None,
        )
        for seg in segments:
            # No-speech filter: Whisper invents words ("You", "Thanks for watching") on music and noise.
            if (getattr(seg, "no_speech_prob", 0.0) or 0.0) > 0.6 or (getattr(seg, "avg_logprob", 0.0) or 0.0) < -1.0:
                dropped += 1
                continue
            low = seg.text.lower()
            if len(low.split()) <= 8 and any(h in low for h in HALLUCINATIONS):
                dropped += 1
                continue
            texts.append(seg.text.strip())
            for w in seg.words or []:
                t = w.word.strip()
                if not t:
                    continue
                s = max(0.0, float(w.start) + offset)
                e = max(s, float(w.end) + offset)
                if dur:
                    s, e = min(s, dur), min(e, dur)
                words.append({"text": t, "start": round(s, 3), "end": round(e, 3), "prob": round(float(w.probability), 3)})
            if dur:
                progress("transcribe", min(1.0, (offset + seg.end) / dur))
        progress("transcribe", (ci + 1) / len(chunks))

    class _Info:
        pass
    info = _Info()
    info.language, info.language_probability = language or "pl", lang_prob

    write_json_atomic(os.path.join(d, "words.json"), words, indent=1)
    transcript = {"language": info.language, "text": " ".join(texts).strip(), "duration": round(dur, 3)}
    write_json_atomic(os.path.join(d, "transcript.json"), transcript, indent=1)
    emit(done=True, words=len(words), language=info.language, languageProbability=round(info.language_probability, 3),
         model=a.model, duration=round(dur, 3), droppedSegments=dropped, cpuThreads=threads)


if __name__ == "__main__":
    run_tool(main)
