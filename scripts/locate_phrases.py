"""Transcribe source speeches with word timestamps and report where each
target phrase occurs, so clips can be cut precisely with ffmpeg.

Usage: python scripts/locate_phrases.py [job_name ...]   (default: all jobs)
"""

import json
import re
import sys

from faster_whisper import WhisperModel

# name, path, target phrase (full line as it should appear in the clip)
JOBS = [
    ("fdr", "raw_audio/fdr_fear.mp3",
     "let me assert my firm belief that the only thing we have to fear is fear itself"),
    ("armstrong", "raw_audio/armstrong_step.wav",
     "one small step for man one giant leap for mankind"),
    ("jfk_asknot", "raw_audio/jfk_inaugural_full.ogg",
     "and so my fellow americans ask not what your country can do for you "
     "ask what you can do for your country"),
    ("jfk_moon", "raw_audio/jfk_rice_full.wav",
     "we choose to go to the moon in this decade and do the other things "
     "not because they are easy but because they are hard"),
    ("reagan", "raw_audio/reagan_full.wav",
     "mr gorbachev tear down this wall"),
]


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


def main() -> None:
    only = set(sys.argv[1:])
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    results = {}
    for name, path, phrase in JOBS:
        if only and name not in only:
            continue
        segments, _ = model.transcribe(path, word_timestamps=True, beam_size=5)
        words = []
        for seg in segments:
            for w in seg.words or []:
                words.append({"w": norm(w.word), "start": w.start, "end": w.end})

        target = [norm(t) for t in phrase.split()]
        allowed_miss = max(1, len(target) // 6)
        hit = None
        for i in range(len(words) - len(target) + 1):
            mismatches = sum(1 for k, t in enumerate(target) if words[i + k]["w"] != t)
            if mismatches <= allowed_miss:
                hit = (round(words[i]["start"], 2),
                       round(words[i + len(target) - 1]["end"], 2))
                break

        context = ""
        if hit:
            ctx = [w["w"] for w in words if hit[0] - 6 <= w["start"] <= hit[1] + 6]
            context = " ".join(ctx)
        results[name] = {"path": path, "phrase": phrase, "hit": hit,
                         "context": context, "n_words": len(words)}
        print(f"{name}: hit={hit}", file=sys.stderr)

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
