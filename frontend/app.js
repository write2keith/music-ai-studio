import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js';
import RegionsPlugin from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.esm.js';

let wavesurfer = null;
let regionsPlugin = null;
let activeRegion = null;
let regionStart = null;
let regionEnd = null;

document.addEventListener("DOMContentLoaded", function () {
    checkHealth();
    setupTabs();
    setupGenerate();
    setupSeparate();
    setupPipeline();
    setupEditor();
});

function showSpinner(id) {
    document.getElementById(id).classList.remove("hidden");
}

function hideSpinner(id) {
    document.getElementById(id).classList.add("hidden");
}

function showResult(id) {
    document.getElementById(id).classList.remove("hidden");
}

function hideResult(id) {
    document.getElementById(id).classList.add("hidden");
}

function setButtonDisabled(btnId, disabled) {
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = disabled;
}

async function checkHealth() {
    try {
        const res = await fetch("/api/model-info");
        const data = await res.json();
        const statusEl = document.getElementById("gpu-status");
        if (data.gpu_available) {
            statusEl.textContent = data.gpu_name;
            statusEl.style.color = "var(--success)";
        } else {
            statusEl.textContent = "CPU only (slow)";
            statusEl.style.color = "#e0a050";
        }
    } catch (e) {
        document.getElementById("gpu-status").textContent = "unavailable";
    }
}

function renderAudioPlayer(url, label) {
    const div = document.createElement("div");
    div.style.marginTop = "0.75rem";
    const title = document.createElement("p");
    title.textContent = label;
    title.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-bottom:0.35rem;";
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;
    audio.style.width = "100%";
    const dl = document.createElement("a");
    dl.href = url;
    dl.download = "";
    dl.className = "download-link";
    dl.textContent = "Download";
    div.appendChild(title);
    div.appendChild(audio);
    div.appendChild(dl);
    return div;
}

function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".tab-panel");
    tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
            const target = this.getAttribute("data-tab");
            tabs.forEach(function (t) { t.classList.remove("active"); });
            panels.forEach(function (p) { p.classList.remove("active"); });
            this.classList.add("active");
            const panel = document.getElementById("tab-" + target);
            if (panel) panel.classList.add("active");
        });
    });
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
}

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "--:--.-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, "0") + ":" + s.toFixed(1).padStart(4, "0");
}

function setupGenerate() {
    const form = document.getElementById("generate-form");
    const durationInput = document.getElementById("duration");
    const durationLabel = document.getElementById("duration-label");
    durationInput.addEventListener("input", function () {
        durationLabel.textContent = this.value + "s";
    });
    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const resultEl = document.getElementById("generate-result");
        setButtonDisabled("generate-btn", true);
        hideResult("generate-result");
        showSpinner("generate-spinner");
        const formData = new FormData();
        formData.append("prompt", document.getElementById("prompt").value);
        formData.append("duration", durationInput.value);
        try {
            const res = await fetch("/api/generate", { method: "POST", body: formData });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Generation failed"); }
            const data = await res.json();
            resultEl.innerHTML = "<h3>Generated</h3>";
            resultEl.appendChild(renderAudioPlayer(data.url, "MusicGen Output"));
            showResult("generate-result");
        } catch (err) {
            resultEl.innerHTML = '<p class="error-msg">Error: ' + err.message + "</p>";
            showResult("generate-result");
        } finally {
            hideSpinner("generate-spinner");
            setButtonDisabled("generate-btn", false);
        }
    });
}

function setupSeparate() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("audio-file");
    const dropText = document.getElementById("drop-text");
    const fileName = document.getElementById("file-name");
    dropZone.addEventListener("click", function () { fileInput.click(); });
    dropZone.addEventListener("dragover", function (e) { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", function () { dropZone.classList.remove("drag-over"); });
    dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; updateFileDisplay(e.dataTransfer.files[0]); }
    });
    fileInput.addEventListener("change", function () { if (this.files.length > 0) updateFileDisplay(this.files[0]); });
    function updateFileDisplay(file) {
        dropText.classList.add("hidden");
        fileName.textContent = file.name + " (" + formatSize(file.size) + ")";
        fileName.classList.remove("hidden");
        setButtonDisabled("separate-btn", false);
    }
    document.getElementById("separate-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const resultEl = document.getElementById("separate-result");
        setButtonDisabled("separate-btn", true);
        hideResult("separate-result");
        showSpinner("separate-spinner");
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        formData.append("model", document.getElementById("model-select").value);
        try {
            const res = await fetch("/api/separate", { method: "POST", body: formData });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Separation failed"); }
            const data = await res.json();
            renderStems(resultEl, data.stems);
            showResult("separate-result");
        } catch (err) {
            resultEl.innerHTML = '<p class="error-msg">Error: ' + err.message + "</p>";
            showResult("separate-result");
        } finally {
            hideSpinner("separate-spinner");
            setButtonDisabled("separate-btn", false);
        }
    });
}

function setupPipeline() {
    const durationInput = document.getElementById("pipeline-duration");
    const durationLabel = document.getElementById("pipeline-duration-label");
    durationInput.addEventListener("input", function () { durationLabel.textContent = this.value + "s"; });
    document.getElementById("pipeline-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        const resultEl = document.getElementById("pipeline-result");
        setButtonDisabled("pipeline-btn", true);
        hideResult("pipeline-result");
        showSpinner("pipeline-spinner");
        const prompt = document.getElementById("pipeline-prompt").value;
        try {
            const genFormData = new FormData();
            genFormData.append("prompt", prompt);
            genFormData.append("duration", durationInput.value);
            resultEl.innerHTML = '<p class="loading-text">Step 1/2: Generating music...</p>';
            showResult("pipeline-result");
            const genRes = await fetch("/api/generate", { method: "POST", body: genFormData });
            if (!genRes.ok) throw new Error("Generation failed");
            const genData = await genRes.json();
            resultEl.innerHTML = '<p class="loading-text">Step 2/2: Separating stems...</p>';
            const audioRes = await fetch(genData.url);
            const audioBlob = await audioRes.blob();
            const sepFormData = new FormData();
            sepFormData.append("file", audioBlob, "generated.wav");
            sepFormData.append("model", "htdemucs");
            const sepRes = await fetch("/api/separate", { method: "POST", body: sepFormData });
            if (!sepRes.ok) throw new Error("Separation failed");
            const sepData = await sepRes.json();
            resultEl.innerHTML = "<h3>Generated & Separated</h3>";
            resultEl.appendChild(renderAudioPlayer(genData.url, "Original (MusicGen)"));
            renderStems(resultEl, sepData.stems);
            showResult("pipeline-result");
        } catch (err) {
            resultEl.innerHTML = '<p class="error-msg">Error: ' + err.message + "</p>";
            showResult("pipeline-result");
        } finally {
            hideSpinner("pipeline-spinner");
            setButtonDisabled("pipeline-btn", false);
        }
    });
}

function renderStems(container, stems) {
    const list = document.createElement("ul");
    list.className = "stem-list";
    const names = Object.keys(stems).sort();
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const url = stems[name];
        const li = document.createElement("li");
        const nameSpan = document.createElement("span");
        nameSpan.className = "stem-name";
        nameSpan.textContent = name;
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = url;
        const dl = document.createElement("a");
        dl.href = url;
        dl.download = name + ".wav";
        dl.className = "download-link";
        dl.textContent = "Download";
        li.appendChild(nameSpan);
        li.appendChild(audio);
        li.appendChild(dl);
        list.appendChild(li);
    }
    container.appendChild(list);
}

// ===== WAVEFORM EDITOR =====

function setupEditor() {
    setupEditorSliders();
    setupEditorButtons();
    setupDialogs();
}

function initWavesurfer(file) {
    if (wavesurfer) {
        wavesurfer.destroy();
    }

    const url = URL.createObjectURL(file);

    regionsPlugin = RegionsPlugin.create();
    activeRegion = null;
    regionStart = null;
    regionEnd = null;

    wavesurfer = WaveSurfer.create({
        container: "#waveform",
        waveColor: "#4a4a6a",
        progressColor: "#7c5cfc",
        cursorColor: "#fff",
        cursorWidth: 1,
        height: 180,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        responsive: true,
        normalize: true,
        plugins: [regionsPlugin],
    });

    wavesurfer.load(url);

    wavesurfer.on("ready", function () {
        document.getElementById("editor-file-label").textContent = file.name;
        document.getElementById("editor-duration").textContent = formatTime(wavesurfer.getDuration());
        setButtonDisabled("editor-play-btn", false);
        setButtonDisabled("editor-stop-btn", false);
        setButtonDisabled("set-region-start-btn", false);
        setButtonDisabled("set-region-end-btn", false);
        setButtonDisabled("clear-region-btn", false);
        updateSelectionButtons();
    });

    wavesurfer.on("audioprocess", function () {
        document.getElementById("editor-current-time").textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("interaction", function () {
        document.getElementById("editor-current-time").textContent = formatTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("finish", function () {
        setButtonDisabled("editor-play-btn", false);
    });

    // Region creation via click-and-drag on waveform
    setupRegionInteraction();
}

function setupRegionInteraction() {
    let isDragging = false;
    let dragStart = 0;

    const container = document.querySelector(".waveform-container");

    container.addEventListener("mousedown", function (e) {
        if (!wavesurfer) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const duration = wavesurfer.getDuration();
        if (!duration) return;
        const time = (x / rect.width) * duration;
        isDragging = true;
        dragStart = time;

        clearRegion();

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging || !wavesurfer) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const duration = wavesurfer.getDuration();
        if (!duration) return;
        const time = Math.max(0, Math.min(duration, (x / rect.width) * duration));

        clearRegion();

        const start = Math.min(dragStart, time);
        const end = Math.max(dragStart, time);

        if (end - start > 0.01) {
            activeRegion = regionsPlugin.addRegion({
                start: start,
                end: end,
                color: "rgba(124, 92, 252, 0.25)",
                drag: true,
                resize: true,
            });

            activeRegion.on("update-end", function () {
                regionStart = activeRegion.start;
                regionEnd = activeRegion.end;
                updateSelectionDisplay();
                updateSelectionButtons();
            });

            activeRegion.on("update", function () {
                regionStart = activeRegion.start;
                regionEnd = activeRegion.end;
                updateSelectionDisplay();
                updateSelectionButtons();
            });

            regionStart = start;
            regionEnd = end;
            updateSelectionDisplay();
            updateSelectionButtons();
            setButtonDisabled("set-region-start-btn", true);
            setButtonDisabled("set-region-end-btn", true);
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    }

    document.getElementById("set-region-start-btn").addEventListener("click", function () {
        if (!wavesurfer) return;
        regionStart = wavesurfer.getCurrentTime();
        updateSelectionDisplay();
        if (regionEnd !== null && regionEnd > regionStart + 0.01) {
            createRegionFromPoints();
        }
    });

    document.getElementById("set-region-end-btn").addEventListener("click", function () {
        if (!wavesurfer) return;
        regionEnd = wavesurfer.getCurrentTime();
        updateSelectionDisplay();
        if (regionStart !== null && regionEnd > regionStart + 0.01) {
            createRegionFromPoints();
        }
    });

    document.getElementById("clear-region-btn").addEventListener("click", function () {
        clearRegion();
    });
}

function createRegionFromPoints() {
    if (!regionsPlugin || regionStart === null || regionEnd === null) return;
    const start = Math.min(regionStart, regionEnd);
    const end = Math.max(regionStart, regionEnd);

    clearRegion();

    activeRegion = regionsPlugin.addRegion({
        start: start,
        end: end,
        color: "rgba(124, 92, 252, 0.25)",
        drag: true,
        resize: true,
    });

    activeRegion.on("update-end", function () {
        regionStart = activeRegion.start;
        regionEnd = activeRegion.end;
        updateSelectionDisplay();
        updateSelectionButtons();
    });

    activeRegion.on("update", function () {
        regionStart = activeRegion.start;
        regionEnd = activeRegion.end;
        updateSelectionDisplay();
        updateSelectionButtons();
    });

    regionStart = start;
    regionEnd = end;
    updateSelectionDisplay();
    updateSelectionButtons();
}

function clearRegion() {
    if (regionsPlugin) {
        regionsPlugin.clearRegions();
    }
    activeRegion = null;
    regionStart = null;
    regionEnd = null;
    updateSelectionDisplay();
    updateSelectionButtons();
}

function updateSelectionDisplay() {
    document.getElementById("selection-start").textContent = regionStart !== null ? formatTime(regionStart) : "--";
    document.getElementById("selection-end").textContent = regionEnd !== null ? formatTime(regionEnd) : "--";
}

function updateSelectionButtons() {
    const hasSelection = regionStart !== null && regionEnd !== null && Math.abs(regionEnd - regionStart) > 0.01;
    setButtonDisabled("action-trim", !hasSelection);
    setButtonDisabled("action-crop", !hasSelection);
    setButtonDisabled("action-fade-in-sel", !hasSelection);
    setButtonDisabled("action-fade-out-sel", !hasSelection);
    document.getElementById("clear-region-btn").disabled = !activeRegion && regionStart === null;
}

function setupEditorButtons() {
    // File load
    document.getElementById("editor-load-btn").addEventListener("click", function () {
        document.getElementById("editor-file-input").click();
    });

    document.getElementById("editor-file-input").addEventListener("change", function () {
        if (this.files.length > 0) {
            loadEditorFile(this.files[0]);
        }
    });

    // Transport
    document.getElementById("editor-play-btn").addEventListener("click", function () {
        if (!wavesurfer) return;
        wavesurfer.playPause();
        const playing = wavesurfer.isPlaying();
        this.innerHTML = playing ? "&#10074;&#10074; Pause" : "&#9654; Play";
    });

    document.getElementById("editor-stop-btn").addEventListener("click", function () {
        if (!wavesurfer) return;
        wavesurfer.stop();
        document.getElementById("editor-play-btn").innerHTML = "&#9654; Play";
    });

    document.getElementById("editor-zoom-in-btn").addEventListener("click", function () {
        if (!wavesurfer) return;
        const current = wavesurfer.options.minPxPerSec || 20;
        wavesurfer.zoom(Math.min(current * 1.5, 1000));
    });

    document.getElementById("editor-zoom-out-btn").addEventListener("click", function () {
        if (!wavesurfer) return;
        const current = wavesurfer.options.minPxPerSec || 20;
        wavesurfer.zoom(Math.max(current / 1.5, 1));
    });

    // Action buttons
    document.getElementById("action-trim").addEventListener("click", function () {
        handleEditorAction("trim");
    });

    document.getElementById("action-crop").addEventListener("click", function () {
        handleEditorAction("crop");
    });

    document.getElementById("action-fade-in-sel").addEventListener("click", function () {
        handleEditorAction("fade-in-sel");
    });

    document.getElementById("action-fade-out-sel").addEventListener("click", function () {
        handleEditorAction("fade-out-sel");
    });

    document.querySelectorAll(".action-btn[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const action = this.getAttribute("data-action");
            if (action === "normalize") handleEditorAction("normalize");
            if (action === "speed") showSpeedDialog();
            if (action === "merge") showMergeDialog();
        });
    });

    document.querySelectorAll(".edit-btn[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            handleEditorAction("effects");
        });
    });

    // Effects toggle
    document.getElementById("action-effects-toggle").addEventListener("click", function () {
        const panel = document.getElementById("effects-panel");
        panel.classList.toggle("hidden");
    });
}

function loadEditorFile(file) {
    hideResult("edit-result");
    initWavesurfer(file);
}

function getEditorFile() {
    const input = document.getElementById("editor-file-input");
    const altInput = document.getElementById("edit-audio-file");
    if (input.files && input.files.length > 0) return input.files[0];
    if (altInput.files && altInput.files.length > 0) return altInput.files[0];
    return null;
}

async function handleEditorAction(action) {
    const resultEl = document.getElementById("edit-result");
    hideResult("edit-result");
    showSpinner("edit-spinner");

    const file = getEditorFile();
    if (!file && action !== "merge") {
        alert("Please load a file first");
        hideSpinner("edit-spinner");
        return;
    }

    const formData = new FormData();
    let url = "/api/edit/";

    try {
        switch (action) {
        case "trim":
            formData.append("file", file);
            formData.append("start_sec", "0");
            formData.append("end_sec", String(regionStart || 0));
            url += "trim";
            break;
        case "crop":
            if (regionStart === null || regionEnd === null) {
                throw new Error("Make a selection first");
            }
            formData.append("file", file);
            formData.append("start_sec", String(regionStart));
            formData.append("end_sec", String(regionEnd));
            url += "trim";
            break;
        case "fade-in-sel":
            formData.append("file", file);
            if (regionStart !== null && regionEnd !== null) {
                formData.append("start_sec", String(regionStart));
                formData.append("end_sec", String(regionEnd));
            }
            formData.append("fade_in", String(1.0));
            formData.append("fade_out", "0");
            url += "fade";
            break;
        case "fade-out-sel":
            formData.append("file", file);
            if (regionStart !== null && regionEnd !== null) {
                formData.append("start_sec", String(regionStart));
                formData.append("end_sec", String(regionEnd));
            }
            formData.append("fade_in", "0");
            formData.append("fade_out", String(1.0));
            url += "fade";
            break;
        case "normalize":
            formData.append("file", file);
            formData.append("target_db", "-1.0");
            url += "normalize";
            break;
        case "effects":
            formData.append("file", file);
            formData.append("reverb_room_size", String((parseFloat(document.getElementById("fx-reverb-room").value) || 0) / 100));
            formData.append("reverb_wet", String((parseFloat(document.getElementById("fx-reverb-wet").value) || 0) / 100));
            formData.append("delay_seconds", document.getElementById("fx-delay-time").value);
            formData.append("delay_feedback", String((parseFloat(document.getElementById("fx-delay-feedback").value) || 0) / 100));
            formData.append("delay_mix", String((parseFloat(document.getElementById("fx-delay-mix").value) || 0) / 100));
            formData.append("eq_low_gain", document.getElementById("fx-eq-low").value);
            formData.append("eq_mid_gain", document.getElementById("fx-eq-mid").value);
            formData.append("eq_high_gain", document.getElementById("fx-eq-high").value);
            formData.append("compressor_threshold", document.getElementById("fx-comp-thresh").value);
            formData.append("compressor_ratio", document.getElementById("fx-comp-ratio").value);
            formData.append("gain_db", document.getElementById("fx-gain").value);
            url += "effects";
            break;
        default:
            throw new Error("Unknown action: " + action);
        }

        const res = await fetch(url, { method: "POST", body: formData });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Edit failed");
        }
        const data = await res.json();

        resultEl.innerHTML = "<h3>Edit Complete</h3>";
        resultEl.appendChild(renderAudioPlayer(data.url, action.charAt(0).toUpperCase() + action.slice(1) + " Result"));
        showResult("edit-result");
    } catch (err) {
        resultEl.innerHTML = '<p class="error-msg">Error: ' + err.message + "</p>";
        showResult("edit-result");
    } finally {
        hideSpinner("edit-spinner");
    }
}

function setupEditorSliders() {
    const sliders = {
        "fx-reverb-room": ["fx-reverb-room-label", "%"],
        "fx-reverb-wet": ["fx-reverb-wet-label", "%"],
        "fx-delay-time": ["fx-delay-time-label", "s", 2],
        "fx-delay-mix": ["fx-delay-mix-label", "%"],
        "fx-delay-feedback": ["fx-delay-feedback-label", "%"],
        "fx-eq-low": ["fx-eq-low-label", " dB"],
        "fx-eq-mid": ["fx-eq-mid-label", " dB"],
        "fx-eq-high": ["fx-eq-high-label", " dB"],
        "fx-comp-thresh": ["fx-comp-thresh-label", " dB", 0, "Off"],
        "fx-comp-ratio": ["fx-comp-ratio-label", ":1", 1],
        "fx-gain": ["fx-gain-label", " dB"],
    };

    Object.keys(sliders).forEach(function (id) {
        const slider = document.getElementById(id);
        const [labelId, suffix, precision, zeroText] = sliders[id];
        const label = document.getElementById(labelId);
        if (!slider || !label) return;

        slider.addEventListener("input", function () {
            const val = parseFloat(this.value);
            if (zeroText && val === 0) {
                label.textContent = zeroText;
            } else {
                const p = precision !== undefined ? precision : (Number.isInteger(val) ? 0 : 1);
                label.textContent = val.toFixed(p) + (suffix || "");
            }
        });
    });
}

function showSpeedDialog() {
    const dlg = document.getElementById("speed-dialog");
    dlg.classList.remove("hidden");

    const slider = document.getElementById("speed-factor-dlg");
    const label = document.getElementById("speed-factor-dlg-label");
    slider.addEventListener("input", function () {
        label.textContent = parseFloat(this.value).toFixed(2) + "x";
    });

    document.getElementById("speed-apply-btn").onclick = async function () {
        dlg.classList.add("hidden");
        const file = getEditorFile();
        if (!file) { alert("Load a file first"); return; }
        const resultEl = document.getElementById("edit-result");
        hideResult("edit-result");
        showSpinner("edit-spinner");
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("factor", slider.value);
            const res = await fetch("/api/edit/speed", { method: "POST", body: formData });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail); }
            const data = await res.json();
            resultEl.innerHTML = "<h3>Speed Changed</h3>";
            resultEl.appendChild(renderAudioPlayer(data.url, "Speed " + parseFloat(slider.value).toFixed(2) + "x"));
            showResult("edit-result");
        } catch (err) {
            resultEl.innerHTML = '<p class="error-msg">Error: ' + err.message + "</p>";
            showResult("edit-result");
        } finally {
            hideSpinner("edit-spinner");
        }
    };

    document.getElementById("speed-cancel-btn").onclick = function () {
        dlg.classList.add("hidden");
    };
}

function showMergeDialog() {
    const dlg = document.getElementById("merge-dialog");
    dlg.classList.remove("hidden");

    document.getElementById("merge-apply-btn").onclick = async function () {
        const input = document.getElementById("merge-files-input");
        if (!input.files || input.files.length < 2) {
            alert("Select at least 2 files");
            return;
        }
        dlg.classList.add("hidden");
        const resultEl = document.getElementById("edit-result");
        hideResult("edit-result");
        showSpinner("edit-spinner");
        try {
            const formData = new FormData();
            for (let i = 0; i < input.files.length; i++) {
                formData.append("files", input.files[i]);
            }
            const res = await fetch("/api/edit/merge", { method: "POST", body: formData });
            if (!res.ok) { const err = await res.json(); throw new Error(err.detail); }
            const data = await res.json();
            resultEl.innerHTML = "<h3>Merged</h3>";
            resultEl.appendChild(renderAudioPlayer(data.url, "Merged Track"));
            showResult("edit-result");
        } catch (err) {
            resultEl.innerHTML = '<p class="error-msg">Error: ' + err.message + "</p>";
            showResult("edit-result");
        } finally {
            hideSpinner("edit-spinner");
        }
    };

    document.getElementById("merge-cancel-btn").onclick = function () {
        dlg.classList.add("hidden");
    };
}

function setupDialogs() {
    // Close dialogs on overlay click
    document.querySelectorAll(".dialog-overlay").forEach(function (overlay) {
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) {
                overlay.classList.add("hidden");
            }
        });
    });

    // Drag-and-drop on the waveform area for file loading
    const container = document.querySelector(".waveform-container");
    if (!container) return;

    container.addEventListener("dragover", function (e) {
        e.preventDefault();
        container.style.border = "2px solid var(--accent)";
    });

    container.addEventListener("dragleave", function () {
        container.style.border = "none";
    });

    container.addEventListener("drop", function (e) {
        e.preventDefault();
        container.style.border = "none";
        if (e.dataTransfer.files.length > 0) {
            loadEditorFile(e.dataTransfer.files[0]);
        }
    });
}
