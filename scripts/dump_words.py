"""Dump Whisper word timestamps for a region of an audio file.

Usage: python scripts/dump_words.py <path> <search_word> [context_words]
"""

import re
import sys

from faster_whisper import WhisperModel


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9']", "", word.lower())


def main() -> None:
    path = sys.argv[1]
    search = norm(sys.argv[2])
    ctx = int(sys.argv[3]) if len(sys.argv) > 3 else 25

    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(path, word_timestamps=True, beam_size=5)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append((norm(w.word), w.start, w.end))

    for i, (w, start, end) in enumerate(words):
        if w == search:
            lo = max(0, i - ctx)
            hi = min(len(words), i + ctx)
            print(f"--- hit at {start:.2f}s ---")
            print(" ".join(f"{t}[{s:.2f}]" for t, s, _ in words[lo:hi]))
            print()


if __name__ == "__main__":
    main()
