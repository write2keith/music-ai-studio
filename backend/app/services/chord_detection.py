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
        self._resnet_model = None

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

    def _load_audio(self, audio_path: str) -> tuple[np.ndarray, int]:
        """Load audio with librosa for multi-format support (MP3, WAV, FLAC, etc.)."""
        import librosa
        data, sr = librosa.load(str(audio_path), sr=None, mono=True)
        data = data.astype(np.float32)
        mx = np.max(np.abs(data))
        if mx > 1e-6:
            data = data / mx
        if data.ndim > 1:
            data = data.mean(axis=1)
        return data, sr

    def extract_chroma_harmonic(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """Extract chroma from harmonic component (HPSS) for cleaner chord features."""
        import librosa
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        # Harmonic-percussive source separation
        harmonic, _ = librosa.effects.hpss(audio, margin=3.0)

        hop_length = 512
        n_bins = 84

        cqt = np.abs(librosa.cqt(
            y=harmonic, sr=sr, hop_length=hop_length,
            n_bins=n_bins, bins_per_octave=12,
            fmin=librosa.note_to_hz("C2"),
        ))

        # CENS chroma: energy-normalized, more robust to timbre variations
        chroma = librosa.feature.chroma_cens(
            C=cqt, sr=sr, hop_length=hop_length,
            n_chroma=12, bins_per_octave=12,
        )

        per_frame_norm = np.linalg.norm(chroma, axis=0)
        per_frame_norm[per_frame_norm < 1e-8] = 1.0
        chroma = chroma / per_frame_norm
        return chroma.astype(np.float32)

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

    def detect_harmonic(self, audio_path: str) -> dict:
        """Detection using harmonic separation + CENS chroma (autoChord-inspired)."""
        data, sr = self._load_audio(audio_path)
        duration = len(data) / sr

        chroma = self.extract_chroma_harmonic(data, sr)
        n_frames = chroma.shape[1]
        hop_length = 512
        frame_time = hop_length / sr

        # Template matching with better chroma
        probs = np.zeros((N_CLASSES, n_frames), dtype=np.float32)
        for f in range(n_frames):
            probs[:, f] = _classify_chroma(chroma[:, f])

        chord_indices = viterbi_decode(probs, self.transitions)
        chords = _indices_to_events(chord_indices, n_frames, frame_time, sr, len(data))

        return {
            "chords": chords,
            "duration_secs": round(duration, 2),
            "method": "harmonic",
        }

    def detect_cnn(self, audio_path: str) -> dict:
        """CNN-based chord detection."""
        data, sr = self._load_audio(audio_path)
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

    def detect_template(self, audio_path: str) -> dict:
        """Template-based chord detection (fallback)."""
        data, sr = self._load_audio(audio_path)
        duration = len(data) / sr

        chroma = self.extract_cqt_chroma(data, sr)
        n_frames = chroma.shape[1]
        hop_length = 512
        frame_time = hop_length / sr

        probs = np.zeros((N_CLASSES, n_frames), dtype=np.float32)
        for f in range(n_frames):
            probs[:, f] = _classify_chroma(chroma[:, f])

        chord_indices = viterbi_decode(probs, self.transitions)
        chords = _indices_to_events(chord_indices, n_frames, frame_time, sr, len(data))

        return {
            "chords": chords,
            "duration_secs": round(duration, 2),
            "method": "cqt-template",
        }

    def detect_beat_sync(self, audio_path: str) -> dict:
        """Beat-synchronous chord detection: aggregate chroma to beat grid for natural chord boundaries."""
        import librosa
        data, sr = self._load_audio(audio_path)
        duration = len(data) / sr

        # Detect beats
        tempo, beat_frames = librosa.beat.beat_track(y=data, sr=sr, units="frames", hop_length=512)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=512)
        beat_times = np.concatenate([[0.0], beat_times])

        if len(beat_times) < 2:
            # Not enough beats detected; fall back to frame-level
            return self.detect_harmonic(audio_path)

        # Harmonic chroma for cleaner features
        chroma = self.extract_chroma_harmonic(data, sr)
        chroma = chroma.T  # shape: (n_frames, 12)

        # Aggregate chroma within each beat
        n_beats = len(beat_times) - 1
        beat_chroma = np.zeros((n_beats, 12), dtype=np.float32)
        beat_counts = np.zeros(n_beats, dtype=np.int32)

        for f in range(chroma.shape[0]):
            t = f * 512 / sr
            for b in range(n_beats):
                if beat_times[b] <= t < beat_times[b + 1]:
                    beat_chroma[b] += chroma[f]
                    beat_counts[b] += 1
                    break

        for b in range(n_beats):
            if beat_counts[b] > 0:
                beat_chroma[b] /= beat_counts[b]

        # PYIN pitch tracking for root note hints
        try:
            f0, voiced, _ = librosa.pyin(
                data, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"),
                sr=sr, hop_length=512,
            )
            # Weight chroma by pitch salience
            pitch_chroma = np.zeros((chroma.shape[0], 12), dtype=np.float32)
            for f in range(min(len(f0), chroma.shape[0])):
                if voiced[f] and f0[f] > 0:
                    midi = 69 + 12 * np.log2(f0[f] / 440.0)
                    pc = int(round(midi)) % 12
                    pitch_chroma[f, pc] += 1.0

            # Aggregate PYIN chroma to beats
            beat_pitch = np.zeros_like(beat_chroma)
            for f in range(pitch_chroma.shape[0]):
                t = f * 512 / sr
                for b in range(n_beats):
                    if beat_times[b] <= t < beat_times[b + 1]:
                        beat_pitch[b] += pitch_chroma[f]
                        break

            # Blend: 80% chroma + 20% pitch
            for b in range(n_beats):
                if np.sum(beat_pitch[b]) > 0:
                    beat_chroma[b] = 0.8 * beat_chroma[b] + 0.2 * (beat_pitch[b] / (np.sum(beat_pitch[b]) + 1e-8))
        except Exception:
            pass

        # Classify each beat
        beat_probs = np.zeros((N_CLASSES, n_beats), dtype=np.float32)
        for b in range(n_beats):
            if np.sum(beat_chroma[b]) < 0.01:
                beat_probs[:, b] = np.ones(N_CLASSES) / N_CLASSES
            else:
                beat_probs[:, b] = _classify_chroma(beat_chroma[b])

        # Viterbi on beats
        chord_indices = viterbi_decode(beat_probs, self.transitions)

        # Convert beat indices back to time events
        chords = []
        i = 0
        while i < n_beats:
            idx = chord_indices[i]
            tpl = TEMPLATES[idx]
            j = i + 1
            while j < n_beats and chord_indices[j] == idx:
                j += 1
            start_time = beat_times[i]
            end_time = beat_times[min(j, n_beats - 1)] if j < n_beats else beat_times[-1] + 1.0
            dur = end_time - start_time
            if dur >= 0.15:
                notes = "-".join(NOTE_NAMES[(tpl["root"] + iv) % 12] for iv in tpl["intervals"])
                chords.append({
                    "start_time": round(max(0, start_time), 3),
                    "end_time": round(min(duration, end_time), 3),
                    "chord": tpl["label"],
                    "notes": notes,
                    "confidence": 0.88,
                })
            i = j

        return {
            "chords": chords,
            "duration_secs": round(duration, 2),
            "method": f"beat-sync+pyin ({int(tempo)} BPM)",
        }

    def detect_resnet(self, audio_path: str) -> dict:
        """ResNet CNN + multi-resolution chroma chord detection."""
        data, sr = self._load_audio(audio_path)
        duration = len(data) / sr

        # Multi-resolution chroma
        import librosa
        harmonic, _ = librosa.effects.hpss(data, margin=3.0)

        # Fine CQT chroma
        cqt = np.abs(librosa.cqt(
            y=harmonic, sr=sr, hop_length=512, n_bins=84, bins_per_octave=12,
            fmin=librosa.note_to_hz("C2"),
        ))
        chroma_fine = librosa.feature.chroma_cens(
            C=cqt, sr=sr, hop_length=512, n_chroma=12, bins_per_octave=12,
        )

        # Coarse CQT (lower octaves for bass notes)
        cqt_bass = np.abs(librosa.cqt(
            y=harmonic, sr=sr, hop_length=512, n_bins=36, bins_per_octave=12,
            fmin=librosa.note_to_hz("C2"),
        ))
        chroma_bass = librosa.feature.chroma_cens(
            C=cqt_bass, sr=sr, hop_length=512, n_chroma=12, bins_per_octave=12,
        )

        # Stack channels: [fine_chroma, bass_chroma] = 24 channels
        chroma = np.vstack([chroma_fine, chroma_bass])
        per_frame_norm = np.linalg.norm(chroma, axis=0)
        per_frame_norm[per_frame_norm < 1e-8] = 1.0
        chroma = chroma / per_frame_norm
        chroma = chroma.astype(np.float32)
        n_frames = chroma.shape[1]
        hop_length = 512
        frame_time = hop_length / sr

        # Use ResNet CNN
        self._load_resnet_model()

        if self._resnet_model is not None:
            import torch
            with torch.no_grad():
                x = torch.from_numpy(chroma.T).unsqueeze(0).permute(0, 2, 1)
                logits = self._resnet_model(x)
                probs = torch.softmax(logits, dim=1).squeeze(0).numpy()
        else:
            probs = np.zeros((N_CLASSES, n_frames), dtype=np.float32)
            for f in range(n_frames):
                probs[:, f] = _classify_chroma(chroma[:12, f])

        chord_indices = viterbi_decode(probs, self.transitions)
        chords = _indices_to_events(chord_indices, n_frames, frame_time, sr, len(data))

        return {
            "chords": chords,
            "duration_secs": round(duration, 2),
            "method": "resnet-cnn" if self._resnet_model is not None else "resnet-template",
        }

    def _load_resnet_model(self):
        try:
            import torch
            self._resnet_model = ResNetChordCNN(n_classes=N_CLASSES, in_channels=24)
            model_path = Path(__file__).parent / "chord_resnet.pt"
            if model_path.exists():
                self._resnet_model.load_state_dict(torch.load(str(model_path), map_location="cpu"))
                self._resnet_model.eval()
                logger.info("Loaded trained chord ResNet CNN model")
            else:
                self._resnet_model = None
        except Exception:
            self._resnet_model = None

    def detect_ensemble(self, audio_path: str) -> dict:
        """Ensemble: run multiple methods, reconcile results by overlapping chord segments."""
        data, sr = self._load_audio(audio_path)
        duration = len(data) / sr

        # Run 3 methods
        results = []
        try:
            results.append(("harmonic", self.detect_harmonic(audio_path)))
        except Exception as e:
            logger.warning(f"Ensemble: harmonic failed: {e}")

        try:
            results.append(("template", self.detect_template(audio_path)))
        except Exception as e:
            logger.warning(f"Ensemble: template failed: {e}")

        try:
            results.append(("beat_sync", self.detect_beat_sync(audio_path)))
        except Exception as e:
            logger.warning(f"Ensemble: beat_sync failed: {e}")

        if not results:
            return {"chords": [], "duration_secs": round(duration, 2), "method": "ensemble (failed)"}

        if len(results) == 1:
            r = results[0][1]
            r["method"] = f"ensemble ({results[0][0]})"
            return r

        # Merge chords: collect all chord events, cluster by time, pick majority label
        all_events = []
        for method_name, r in results:
            for c in r["chords"]:
                all_events.append({
                    "start_time": c["start_time"],
                    "end_time": c["end_time"],
                    "chord": c["chord"],
                    "notes": c["notes"],
                })

        all_events.sort(key=lambda e: e["start_time"])

        # Simple reconciliation: greedy merge of overlapping events
        merged = []
        used = [False] * len(all_events)
        for i, event in enumerate(all_events):
            if used[i]:
                continue
            cluster = [event]
            used[i] = True
            for j in range(i + 1, len(all_events)):
                if used[j]:
                    continue
                if all_events[j]["start_time"] <= event["end_time"] + 0.3:
                    cluster.append(all_events[j])
                    used[j] = True
            # Pick majority chord label in cluster
            votes: dict[str, int] = {}
            for e in cluster:
                votes[e["chord"]] = votes.get(e["chord"], 0) + 1
            best_chord = max(votes, key=lambda k: votes[k])
            best_event = next((e for e in cluster if e["chord"] == best_chord), event)
            merged.append(best_event)

        # Fill gaps
        if merged:
            for i in range(len(merged) - 1):
                if merged[i + 1]["start_time"] > merged[i]["end_time"]:
                    merged[i + 1]["start_time"] = merged[i]["end_time"]

        for m in merged:
            m["confidence"] = 0.90

        return {
            "chords": merged,
            "duration_secs": round(duration, 2),
            "method": f"ensemble ({','.join(n for n, _ in results)})",
        }

    def detect(self, audio_path: str, method: str = "harmonic") -> dict:
        if method == "cnn":
            return self.detect_cnn(audio_path)
        elif method == "template":
            return self.detect_template(audio_path)
        elif method == "beat_sync":
            return self.detect_beat_sync(audio_path)
        elif method == "resnet":
            return self.detect_resnet(audio_path)
        elif method == "ensemble":
            return self.detect_ensemble(audio_path)
        else:
            return self.detect_harmonic(audio_path)


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


class ResidualBlock:
    """Residual block with skip connection for deeper networks."""
    def __init__(self, channels: int, kernel_size: int = 3):
        import torch.nn as nn
        self.conv1 = nn.Conv1d(channels, channels, kernel_size, padding=kernel_size // 2, bias=False)
        self.bn1 = nn.BatchNorm1d(channels)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv1d(channels, channels, kernel_size, padding=kernel_size // 2, bias=False)
        self.bn2 = nn.BatchNorm1d(channels)

    def __call__(self, x):
        residual = x
        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)
        out = self.conv2(out)
        out = self.bn2(out)
        out += residual
        out = self.relu(out)
        return out


class ResNetChordCNN:
    """Deeper residual CNN with multi-resolution chroma input for chord classification."""
    def __init__(self, n_classes: int = N_CLASSES, in_channels: int = 24):
        import torch.nn as nn

        self.net = nn.Sequential(
            nn.Conv1d(in_channels, 128, kernel_size=7, padding=3, bias=False),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            ResidualBlock(128, 5),
            ResidualBlock(128, 5),
            nn.Conv1d(128, 256, kernel_size=5, padding=2, bias=False),
            nn.BatchNorm1d(256),
            nn.ReLU(inplace=True),
            ResidualBlock(256, 3),
            ResidualBlock(256, 3),
            nn.Conv1d(256, 512, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm1d(512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.AdaptiveAvgPool1d(1),
            nn.Flatten(),
            nn.Linear(512, n_classes),
        )

    def eval(self):
        self.net.eval()

    def load_state_dict(self, state_dict):
        self.net.load_state_dict(state_dict)

    def __call__(self, x):
        return self.net(x)
