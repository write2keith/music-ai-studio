import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

CHORD_CHROMA_TEMPLATES: dict[str, list[int]] = {
    "":    [0, 4, 7],
    "m":   [0, 3, 7],
    "dim": [0, 3, 6],
    "aug": [0, 4, 8],
    "7":   [0, 4, 7, 10],
    "maj7":[0, 4, 7, 11],
    "m7":  [0, 3, 7, 10],
    "dim7":[0, 3, 6, 9],
    "sus2":[0, 2, 7],
    "sus4":[0, 5, 7],
    "m7b5":[0, 3, 6, 10],
}

def _build_templates() -> list[dict]:
    templates: list[dict] = []
    for root_idx in range(12):
        for suffix, intervals in CHORD_CHROMA_TEMPLATES.items():
            mask = np.zeros(12, dtype=np.float32)
            for interval in intervals:
                mask[(root_idx + interval) % 12] = 1.0
            label = f"{NOTE_NAMES[root_idx]}{suffix}"
            templates.append({
                "label": label, "root": root_idx, "suffix": suffix,
                "mask": mask / (np.linalg.norm(mask) or 1.0),
                "intervals": intervals,
            })
    return templates

TEMPLATES = _build_templates()
N_CLASSES = len(TEMPLATES)


def _build_viterbi_transitions() -> np.ndarray:
    """Build transition matrix: heavy diagonal bias for temporal stability."""
    T = np.eye(N_CLASSES, dtype=np.float32) * 0.85

    for i, a in enumerate(TEMPLATES):
        for j, b in enumerate(TEMPLATES):
            if i == j:
                continue
            if a["root"] == b["root"] and a["suffix"] == b["suffix"]:
                continue
            if a["root"] == b["root"]:
                T[i, j] = 0.04
            elif (b["root"] - a["root"]) % 12 in {5, 7}:
                T[i, j] = 0.03
            elif a["suffix"] == b["suffix"]:
                T[i, j] = 0.02
            else:
                T[i, j] = 0.005

    T = T / T.sum(axis=1, keepdims=True)
    return T


def _classify_chroma(chroma_vector: np.ndarray) -> np.ndarray:
    eps = 1e-8
    nz = int(np.sum(chroma_vector > 0.05))
    if nz < 2:
        return np.ones(N_CLASSES, dtype=np.float32) / N_CLASSES

    scores = np.zeros(N_CLASSES, dtype=np.float32)
    for i, tpl in enumerate(TEMPLATES):
        hit = sum(chroma_vector[(tpl["root"] + iv) % 12] for iv in tpl["intervals"])
        present = len(tpl["intervals"])
        hit_score = hit / max(present, 1)
        penalty = sum(
            chroma_vector[b] for b in range(12)
            if b not in {(tpl["root"] + iv) % 12 for iv in tpl["intervals"]}
        )
        penalty = penalty / max(12 - present, 1)
        scores[i] = max(0.0, hit_score - 0.5 * penalty)

    total = scores.sum()
    if total < eps:
        return np.ones(N_CLASSES, dtype=np.float32) / N_CLASSES
    return scores / total


class ChordDetector:
    def __init__(self):
        self.transitions = _build_viterbi_transitions()
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return
        try:
            import torch
            self._model = ChordCNN(n_classes=N_CLASSES)
            model_path = Path(__file__).parent / "chord_model.pt"
            if model_path.exists():
                self._model.load_state_dict(torch.load(str(model_path), map_location="cpu"))
                self._model.eval()
                logger.info("Loaded trained chord CNN model")
            else:
                self._model = None
        except Exception:
            self._model = None

    def extract_cqt_chroma(self, audio: np.ndarray, sr: int) -> np.ndarray:
        import librosa
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        mx = np.max(np.abs(audio))
        if mx > 1e-6:
            audio = audio / mx

        hop_length = 512
        n_bins = 84

        cqt = np.abs(librosa.cqt(
            y=audio, sr=sr, hop_length=hop_length,
            n_bins=n_bins, bins_per_octave=12,
            fmin=librosa.note_to_hz("C2"),
        ))
        chroma = librosa.feature.chroma_cqt(
            C=cqt, sr=sr, hop_length=hop_length,
            n_chroma=12, bins_per_octave=12,
        )
        per_frame_norm = np.linalg.norm(chroma, axis=0)
        per_frame_norm[per_frame_norm < 1e-8] = 1.0
        chroma = chroma / per_frame_norm
        return chroma.astype(np.float32)

    def detect(self, audio_path: str) -> dict:
        import scipy.io.wavfile as wav
        sr, data = wav.read(str(audio_path))
        data = data.astype(np.float32)
        if data.ndim > 1:
            data = data.mean(axis=1)
        duration = len(data) / sr

        self._load_model()

        chroma = self.extract_cqt_chroma(data, sr)
        n_frames = chroma.shape[1]
        hop_length = 512
        frame_time = hop_length / sr

        if self._model is not None:
            import torch
            with torch.no_grad():
                x = torch.from_numpy(chroma.T).unsqueeze(0).permute(0, 2, 1)
                logits = self._model(x)
                probs = torch.softmax(logits, dim=1).squeeze(0).numpy()
        else:
            probs = np.zeros((N_CLASSES, n_frames), dtype=np.float32)
            for f in range(n_frames):
                probs[:, f] = _classify_chroma(chroma[:, f])

        chord_indices = viterbi_decode(probs, self.transitions)
        chords = _indices_to_events(chord_indices, n_frames, frame_time, sr, len(data))
        return {
            "chords": chords,
            "duration_secs": round(duration, 2),
            "method": "cnn" if self._model is not None else "cqt-template",
        }


def viterbi_decode(probs: np.ndarray, transitions: np.ndarray) -> np.ndarray:
    n_classes, n_frames = probs.shape
    eps = 1e-12
    log_probs = np.log(probs + eps)
    log_trans = np.log(transitions + eps)

    viterbi = np.zeros((n_classes, n_frames), dtype=np.float32)
    backptr = np.zeros((n_classes, n_frames), dtype=np.int32)

    viterbi[:, 0] = log_probs[:, 0]
    for t in range(1, n_frames):
        for s in range(n_classes):
            scores = viterbi[:, t - 1] + log_trans[:, s]
            best_prev = int(np.argmax(scores))
            viterbi[s, t] = log_probs[s, t] + scores[best_prev]
            backptr[s, t] = best_prev

    path = np.zeros(n_frames, dtype=np.int32)
    path[-1] = int(np.argmax(viterbi[:, -1]))
    for t in range(n_frames - 2, -1, -1):
        path[t] = backptr[path[t + 1], t + 1]
    return path


def _indices_to_events(indices, n_frames, frame_time, sr, total_samples) -> list[dict]:
    chords = []
    i = 0
    while i < n_frames:
        idx = indices[i]
        tpl = TEMPLATES[idx]
        j = i + 1
        while j < n_frames and indices[j] == idx:
            j += 1
        start_time = i * frame_time
        end_time = min(j * frame_time, total_samples / sr)
        dur = end_time - start_time
        if dur >= 0.15:
            notes = "-".join(NOTE_NAMES[(tpl["root"] + iv) % 12] for iv in tpl["intervals"])
            chords.append({
                "start_time": round(start_time, 3),
                "end_time": round(end_time, 3),
                "chord": tpl["label"],
                "notes": notes,
                "confidence": 0.80,
            })
        i = j
    return chords


class ChordCNN:
    """Lightweight 1D CNN for frame-level chord classification on chroma input."""
    def __init__(self, n_classes: int = N_CLASSES):
        import torch
        import torch.nn as nn

        self.net = nn.Sequential(
            nn.Conv1d(12, 64, kernel_size=7, padding=3),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.Conv1d(64, 128, kernel_size=5, padding=2),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Conv1d(128, 128, kernel_size=3, padding=1),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Conv1d(128, n_classes, kernel_size=1),
        )

    def eval(self):
        self.net.eval()

    def load_state_dict(self, state_dict):
        self.net.load_state_dict(state_dict)

    def __call__(self, x):
        return self.net(x)
