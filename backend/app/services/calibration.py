import json
import logging
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

CALIBRATION_DIR = Path("data/calibration")
CALIBRATION_DIR.mkdir(parents=True, exist_ok=True)


def _load_calibration(store_id: str) -> dict:
    path = CALIBRATION_DIR / f"{store_id}.json"
    if not path.exists():
        return {
            "store_id": store_id,
            "total_corrections": 0,
            "corrections": [],
            "params": {
                "threshold_multiplier": 1.5,
                "stability_frames": 2,
                "min_duration_sec": 0.04,
                "merge_gap_sec": 0.10,
                "noise_percentile": 50,
            },
            "accuracy": 1.0,
            "chord_corrections": 0,
            "chord_accuracy": 1.0,
        }
    try:
        return json.loads(path.read_text())
    except Exception:
        logger.warning(f"Corrupt calibration file for {store_id}, resetting")
        return _load_calibration(store_id)


def _save_calibration(data: dict):
    path = CALIBRATION_DIR / f"{data['store_id']}.json"
    path.write_text(json.dumps(data, indent=2))


def get_calibration(store_id: str) -> dict:
    return _load_calibration(store_id)


def record_correction(
    store_id: str,
    tool: str,
    note_pitch: int | None = None,
    note_name: str | None = None,
    original_pitch: int | None = None,
    original_note: str | None = None,
    action: str = "corrected",
    detail: str = "",
):
    data = _load_calibration(store_id)
    correction = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tool": tool,
        "action": action,
        "note_pitch": note_pitch,
        "note_name": note_name,
        "original_pitch": original_pitch,
        "original_note": original_note,
        "detail": detail,
    }
    data["corrections"].append(correction)
    data["total_corrections"] += 1

    corrections = data["corrections"]
    recent = corrections[-50:]

    pitch_corrections = [c for c in recent if c.get("note_pitch") is not None and c.get("original_pitch") is not None]
    if len(pitch_corrections) >= 3:
        errors = [abs(c["note_pitch"] - c["original_pitch"]) for c in pitch_corrections]
        avg_error = sum(errors) / len(errors)

        if avg_error > 2:
            data["params"]["threshold_multiplier"] = max(0.8, data["params"]["threshold_multiplier"] - 0.05)
            data["params"]["stability_frames"] = max(1, data["params"]["stability_frames"] - 1)
        elif avg_error < 0.5 and data["total_corrections"] > 20 and len(pitch_corrections) > 10:
            data["params"]["threshold_multiplier"] = min(3.0, data["params"]["threshold_multiplier"] + 0.02)

    missed_notes = [c for c in recent if c["action"] == "added"]
    false_positives = [c for c in recent if c["action"] == "removed"]
    if len(missed_notes) > len(false_positives) + 3:
        data["params"]["threshold_multiplier"] = max(0.8, data["params"]["threshold_multiplier"] - 0.08)
        data["params"]["min_duration_sec"] = max(0.02, data["params"]["min_duration_sec"] - 0.005)
    elif len(false_positives) > len(missed_notes) + 3:
        data["params"]["threshold_multiplier"] = min(3.0, data["params"]["threshold_multiplier"] + 0.08)
        data["params"]["min_duration_sec"] = min(0.15, data["params"]["min_duration_sec"] + 0.005)

    total = len(pitch_corrections)
    exact = sum(1 for c in pitch_corrections if abs(c["note_pitch"] - c["original_pitch"]) == 0)
    within_1 = sum(1 for c in pitch_corrections if abs(c["note_pitch"] - c["original_pitch"]) <= 1)
    data["accuracy"] = round((exact * 1.0 + (within_1 - exact) * 0.5) / max(total, 1), 3)

    _save_calibration(data)
    logger.info(f"Calibration [{store_id}]: {action} pitch {original_pitch}->{note_pitch}, accuracy={data['accuracy']:.3f}")


def record_chord_correction(
    store_id: str,
    original_chord: str | None = None,
    corrected_chord: str | None = None,
    detail: str = "",
):
    data = _load_calibration(store_id)
    correction = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tool": "chord-detect",
        "action": "corrected_chord",
        "original_chord": original_chord,
        "corrected_chord": corrected_chord,
        "detail": detail,
    }
    data["corrections"].append(correction)
    data["total_corrections"] += 1
    data.setdefault("chord_corrections", 0)
    data["chord_corrections"] += 1

    chord_corrections = [c for c in data["corrections"] if c.get("action") == "corrected_chord"]
    total_chord = len(chord_corrections)
    correct_chord = sum(1 for c in chord_corrections if c.get("original_chord") == c.get("corrected_chord"))
    data["chord_accuracy"] = round(correct_chord / max(total_chord, 1), 3)

    _save_calibration(data)
    logger.info(f"Calibration [{store_id}]: chord {original_chord}->{corrected_chord}, chord_accuracy={data['chord_accuracy']:.3f}")


def get_detection_params(store_id: str) -> dict:
    return _load_calibration(store_id)["params"]


def get_calibration_stats() -> dict:
    stores = {}
    for f in CALIBRATION_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            stores[data["store_id"]] = {
                "total_corrections": data["total_corrections"],
                "accuracy": data.get("accuracy", 1.0),
                "params": data.get("params", {}),
                "chord_corrections": data.get("chord_corrections", 0),
                "chord_accuracy": data.get("chord_accuracy", 1.0),
            }
        except Exception:
            pass
    return stores
