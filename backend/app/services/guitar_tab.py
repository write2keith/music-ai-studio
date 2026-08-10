"""Guitar Pro import/export and Tayuya fretboard mapping."""

from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

GUITAR_TUNINGS: dict[str, dict[str, Any]] = {
    "standard": {"strings": ["E", "A", "D", "G", "B", "e"], "midi": [40, 45, 50, 55, 59, 64]},
    "drop_d": {"strings": ["D", "A", "D", "G", "B", "e"], "midi": [38, 45, 50, 55, 59, 64]},
    "open_g": {"strings": ["D", "G", "D", "G", "B", "D"], "midi": [38, 43, 50, 55, 59, 62]},
    "open_d": {"strings": ["D", "A", "D", "F#", "A", "D"], "midi": [38, 45, 50, 54, 57, 62]},
    "open_e": {"strings": ["E", "B", "E", "G#", "B", "E"], "midi": [40, 47, 52, 56, 59, 64]},
    "dadgad": {"strings": ["D", "A", "D", "G", "A", "D"], "midi": [38, 45, 50, 55, 57, 62]},
    "half_step_down": {"strings": ["Eb", "Ab", "Db", "Gb", "Bb", "eb"], "midi": [39, 44, 49, 54, 58, 63]},
    "drop_c": {"strings": ["C", "G", "C", "F", "A", "D"], "midi": [36, 43, 48, 53, 57, 62]},
    "c_standard": {"strings": ["C", "F", "Bb", "Eb", "G", "C"], "midi": [36, 41, 46, 51, 55, 60]},
}

DEFAULT_TUNING = "standard"
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAX_FRET = 24


def parse_gp_file(file_path: str) -> list[dict[str, Any]]:
    """Parse a Guitar Pro file (.gp3/.gp4/.gp5/.gpx) and return notes.
    Falls back to simplified extraction if full parse fails."""
    import guitarpro

    notes = []

    with open(file_path, "rb") as fh:
        try:
            song = guitarpro.parse(fh)
        except Exception as e:
            logger.warning(f"Full GP parse failed ({e}), trying simplified extraction")
            fh.seek(0)
            return _parse_gp_simplified(fh)

    try:
        tempo = song.tempo or 120
        for track in song.tracks:
            try:
                if hasattr(track, "isPercussionTrack") and track.isPercussionTrack:
                    continue
                for measure in track.measures:
                    measure_start = (measure.header.number - 1) * (
                        song.measureHeader.denominator.value or 4
                    ) * 60.0 / tempo
                    beat_time = measure_start

                    for voice in measure.voices:
                        for beat in voice.beats:
                            beat_duration = _duration_to_seconds(beat.duration, tempo)
                            for note in beat.notes:
                                notes.append({
                                    "start_time": round(beat_time, 3),
                                    "end_time": round(beat_time + beat_duration, 3),
                                    "pitch": note.value,
                                    "note_name": NOTE_NAMES[note.value % 12] + str(note.value // 12 - 1),
                                    "string": note.string - 1,
                                    "string_name": "",
                                    "fret": note.value - _gp_tuning_midi(track.strings, note.string),
                                    "velocity": max(0.3, note.dynamic / 127.0) if hasattr(note, "dynamic") else 0.7,
                                })
                            beat_time += beat_duration
            except Exception as track_err:
                logger.warning(f"Skipping track due to parse error: {track_err}")
                continue
    except Exception as e:
        logger.warning(f"GP track iteration failed: {e}, trying simplified extraction")
        try:
            fh = open(file_path, "rb")
            notes = _parse_gp_simplified(fh)
            fh.close()
        except Exception:
            pass

    return notes


def _parse_gp_simplified(file_handle) -> list[dict[str, Any]]:
    """Simplified GP extraction: iterates raw structure with getattr fallbacks."""
    import guitarpro
    notes = []
    try:
        song = guitarpro.parse(file_handle)
        tempo = getattr(song, "tempo", 120) or 120
        for track in getattr(song, "tracks", []):
            if getattr(track, "isPercussionTrack", False):
                continue
            for measure in getattr(track, "measures", []):
                beat_time = (getattr(measure.header, "number", 1) - 1) * 4 * 60.0 / tempo
                for voice in getattr(measure, "voices", []):
                    for beat in getattr(voice, "beats", []):
                        dur = _duration_to_seconds(getattr(beat, "duration", None), tempo)
                        for note in getattr(beat, "notes", []):
                            try:
                                string_num = getattr(note, "string", 1)
                                fret = getattr(note, "value", 64) - _gp_tuning_midi(
                                    getattr(track, "strings", []), string_num
                                )
                                notes.append({
                                    "start_time": round(beat_time, 3),
                                    "end_time": round(beat_time + dur, 3),
                                    "pitch": getattr(note, "value", 64),
                                    "note_name": NOTE_NAMES[getattr(note, "value", 64) % 12]
                                                + str(getattr(note, "value", 64) // 12 - 1),
                                    "string": string_num - 1,
                                    "string_name": "",
                                    "fret": max(0, fret),
                                    "velocity": 0.7,
                                })
                            except Exception:
                                continue
                        beat_time += dur
    except Exception as e:
        logger.warning(f"Simplified GP parse also failed: {e}")
    return notes


def _gp_tuning_midi(strings, string_num: int) -> int:
    try:
        if hasattr(strings, "__len__"):
            idx = len(strings) - string_num
            if 0 <= idx < len(strings):
                return strings[idx].value
    except Exception:
        pass
    std = [40, 45, 50, 55, 59, 64]
    idx = 6 - string_num
    return std[idx] if 0 <= idx < 6 else 64


def _duration_to_seconds(duration, tempo: float) -> float:
    from guitarpro import Duration as GPDuration
    beat_seconds = 60.0 / tempo
    value = duration.value if isinstance(duration.value, int) else 4
    dots = duration.tuplet if hasattr(duration, "tuplet") else 0
    base = beat_seconds * (4.0 / value)
    for _ in range(dots):
        base += base / 2.0
    return base


def _velocity_to_gp_dynamic(velocity: float) -> int:
    """Map note velocity (0.0-1.0) to Guitar Pro MIDI dynamic (0-127).
    ppp=16, pp=33, p=49, mp=64, mf=80, f=96, ff=112, fff=127"""
    if velocity <= 0.08:
        return 16
    elif velocity <= 0.15:
        return 33
    elif velocity <= 0.25:
        return 49
    elif velocity <= 0.35:
        return 64
    elif velocity <= 0.50:
        return 80
    elif velocity <= 0.65:
        return 96
    elif velocity <= 0.80:
        return 112
    else:
        return 127


def _duration_to_gp_value(dur_secs: float, tempo: float = 120) -> tuple[int, bool]:
    """Map note duration in seconds to closest GP rhythmic value + dotted flag."""
    beat_secs = 60.0 / tempo
    note_duration = dur_secs / beat_secs

    candidates = [
        (64, False, 0.015625),
        (32, False, 0.03125),
        (16, False, 0.0625),
        (16, True, 0.09375),
        (8,  False, 0.125),
        (8,  True,  0.1875),
        (4,  False, 0.25),
        (4,  True,  0.375),
        (2,  False, 0.5),
        (2,  True,  0.75),
        (1,  False, 1.0),
        (1,  True,  1.5),
    ]

    best = (4, False)
    best_dist = float("inf")
    for val, dotted, target in candidates:
        dist = abs(note_duration - target)
        if dist < best_dist:
            best_dist = dist
            best = (val, dotted)

    return best


def export_gp_file(notes: list[dict[str, Any]], tuning_key: str, output_path: str, tempo: float = 120) -> str:
    """Export notes to a Guitar Pro 5 file with velocity-to-dynamics mapping."""
    import guitarpro

    tuning = GUITAR_TUNINGS.get(tuning_key, GUITAR_TUNINGS[DEFAULT_TUNING])
    song = guitarpro.models.Song()

    track = guitarpro.models.Track(song)
    track.name = "Generated Tab"
    track.channel = guitarpro.models.MidiChannel(channel=0, instrument=25)
    track.strings = [
        guitarpro.models.GuitarString(number=i+1, value=v)
        for i, v in enumerate(tuning["midi"])
    ]

    song.tracks = [track]
    song.tempo = int(tempo)

    time_sig = guitarpro.models.TimeSignature(numerator=4, denominator=guitarpro.models.Duration(value=4))

    if not notes:
        try:
            with open(output_path, "wb") as fh:
                guitarpro.write(song, fh)
        except Exception:
            pass
        return output_path

    sorted_notes = sorted(notes, key=lambda n: n.get("start_time", 0))
    end_time = sorted_notes[-1].get("end_time", sorted_notes[-1].get("start_time", 0) + 0.5)
    quarter_secs = 60.0 / tempo
    total_beats = max(1, int(end_time / quarter_secs) + 1)

    measure_header = guitarpro.models.MeasureHeader(number=1, timeSignature=time_sig)
    measure = guitarpro.models.Measure(track, measure_header)
    voice = guitarpro.models.Voice(measure)

    beats = []
    for beat_idx in range(total_beats):
        beat = guitarpro.models.Beat(voice)
        beat.start = beat_idx * 480

        beat_start = beat_idx * quarter_secs
        beat_end = beat_start + quarter_secs

        beat_notes = []
        for note in sorted_notes:
            note_start = note.get("start_time", 0)
            note_end = note.get("end_time", note_start + 0.25)
            if note_start < beat_end and note_end > beat_start:
                gp_note = guitarpro.models.Note(beat)
                gp_note.value = note.get("pitch", 64)
                gp_note.string = max(1, note.get("string", 0) + 1)
                gp_note.type = guitarpro.models.NoteType.normal

                velocity = note.get("velocity", 0.7)
                gp_note.dynamic = _velocity_to_gp_dynamic(velocity)

                dur_secs = note_end - note_start
                dur_value, is_dotted = _duration_to_gp_value(dur_secs, tempo)
                beat.duration = guitarpro.models.Duration(value=dur_value, isDotted=is_dotted)

                beat_notes.append(gp_note)

        if beat_notes:
            beat.notes = beat_notes
            beats.append(beat)

    voice.beats = beats
    measure.voices = [voice]
    track.measures = [measure]
    song.measureHeaders = [measure_header]

    try:
        with open(output_path, "wb") as fh:
            guitarpro.write(song, fh, version=(5, 0))
    except Exception as e:
        logger.warning(f"GP export error (retrying): {e}")
        with open(output_path, "wb") as fh:
            guitarpro.write(song, fh)

    return output_path


def _name_to_midi(name: str) -> int:
    try:
        n = name.rstrip("0123456789")
        octave = int(name[len(n):])
        idx = NOTE_NAMES.index(n)
        return (octave + 1) * 12 + idx
    except (ValueError, IndexError):
        return 64


def midi_to_tab_tayuya(midi_notes: list[dict], tuning_key: str = DEFAULT_TUNING) -> list[tuple[int, int]]:
    """Map MIDI notes to guitar string/fret using Tayuya's proximity-aware mapper."""
    try:
        from tayuya import Tabs

        tayuya_notes = []
        for n in midi_notes:
            midi = n.get("pitch", n.get("midi", 64))
            note_name = n.get("note_name", "")
            if not note_name:
                note_name = NOTE_NAMES[midi % 12] + str(midi // 12 - 1)
            tayuya_notes.append({"note": note_name, "time": n.get("start_time", 0)})

        root_midi = midi_notes[0]["pitch"] if midi_notes else 64
        root_name = NOTE_NAMES[root_midi % 12]
        root_octave = root_midi // 12 - 1
        key_tuple = (f"{root_name}{root_octave}", "major")

        tabs = Tabs(notes=tayuya_notes, key=key_tuple)
        to_play = tabs.generate_notes()

        results = []
        for note_name, string_num, fret in to_play:
            string_idx = int(string_num) - 1
            results.append((string_idx, int(fret)))

        return results
    except Exception as e:
        logger.warning(f"Tayuya mapping failed, using fallback: {e}")
        return _midi_to_tab_fallback(midi_notes, tuning_key)


def _midi_to_tab_fallback(midi_notes: list[dict], tuning_key: str = DEFAULT_TUNING) -> list[tuple[int, int]]:
    tuning = GUITAR_TUNINGS.get(tuning_key, GUITAR_TUNINGS[DEFAULT_TUNING])
    results = []
    prev_fret = 0

    for n in midi_notes:
        midi = n.get("pitch", n.get("midi", 64))
        best_string = 0
        best_fret = 0
        best_dist = 999

        for s, open_midi in enumerate(tuning["midi"]):
            fret = midi - open_midi
            if 0 <= fret <= MAX_FRET:
                dist = abs(fret - prev_fret)
                if dist < best_dist:
                    best_dist = dist
                    best_string = s
                    best_fret = fret

        if best_dist == 999:
            best_string = 0
            best_fret = 0

        results.append((best_string, best_fret))
        prev_fret = best_fret

    return results


def get_tuning_midi(tuning_key: str) -> list[int]:
    tuning = GUITAR_TUNINGS.get(tuning_key, GUITAR_TUNINGS[DEFAULT_TUNING])
    return tuning["midi"]
