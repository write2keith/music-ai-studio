document.addEventListener("DOMContentLoaded", function () {
    checkHealth();
    setupGenerate();
    setupSeparate();
    setupPipeline();
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
    document.getElementById(btnId).disabled = disabled;
}

async function checkHealth() {
    try {
        const res = await fetch("/api/model-info");
        const data = await res.json();
        var statusEl = document.getElementById("gpu-status");
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
    var div = document.createElement("div");
    div.style.marginTop = "0.75rem";
    var title = document.createElement("p");
    title.textContent = label;
    title.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-bottom:0.35rem;";
    var audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;
    audio.style.width = "100%";
    var dl = document.createElement("a");
    dl.href = url;
    dl.download = "";
    dl.className = "download-link";
    dl.textContent = "Download";
    div.appendChild(title);
    div.appendChild(audio);
    div.appendChild(dl);
    return div;
}

function setupGenerate() {
    var form = document.getElementById("generate-form");
    var durationInput = document.getElementById("duration");
    var durationLabel = document.getElementById("duration-label");

    durationInput.addEventListener("input", function () {
        durationLabel.textContent = this.value + "s";
    });

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var btn = document.getElementById("generate-btn");
        var resultEl = document.getElementById("generate-result");

        setButtonDisabled("generate-btn", true);
        hideResult("generate-result");
        showSpinner("generate-spinner");

        var formData = new FormData();
        formData.append("prompt", document.getElementById("prompt").value);
        formData.append("duration", durationInput.value);

        try {
            var res = await fetch("/api/generate", { method: "POST", body: formData });
            if (!res.ok) {
                var err = await res.json();
                throw new Error(err.detail || "Generation failed");
            }
            var data = await res.json();
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
    var dropZone = document.getElementById("drop-zone");
    var fileInput = document.getElementById("audio-file");
    var dropText = document.getElementById("drop-text");
    var fileName = document.getElementById("file-name");

    dropZone.addEventListener("click", function () {
        fileInput.click();
    });

    dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", function () {
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        var files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            updateFileDisplay(files[0]);
        }
    });

    fileInput.addEventListener("change", function () {
        if (this.files.length > 0) {
            updateFileDisplay(this.files[0]);
        }
    });

    function updateFileDisplay(file) {
        dropText.classList.add("hidden");
        fileName.textContent = file.name + " (" + formatSize(file.size) + ")";
        fileName.classList.remove("hidden");
        setButtonDisabled("separate-btn", false);
    }

    document.getElementById("separate-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var btn = document.getElementById("separate-btn");
        var resultEl = document.getElementById("separate-result");

        setButtonDisabled("separate-btn", true);
        hideResult("separate-result");
        showSpinner("separate-spinner");

        var formData = new FormData();
        formData.append("file", fileInput.files[0]);
        formData.append("model", document.getElementById("model-select").value);

        try {
            var res = await fetch("/api/separate", { method: "POST", body: formData });
            if (!res.ok) {
                var err = await res.json();
                throw new Error(err.detail || "Separation failed");
            }
            var data = await res.json();
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
    var durationInput = document.getElementById("pipeline-duration");
    var durationLabel = document.getElementById("pipeline-duration-label");

    durationInput.addEventListener("input", function () {
        durationLabel.textContent = this.value + "s";
    });

    document.getElementById("pipeline-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var btn = document.getElementById("pipeline-btn");
        var resultEl = document.getElementById("pipeline-result");

        setButtonDisabled("pipeline-btn", true);
        hideResult("pipeline-result");
        showSpinner("pipeline-spinner");

        var prompt = document.getElementById("pipeline-prompt").value;

        try {
            var genFormData = new FormData();
            genFormData.append("prompt", prompt);
            genFormData.append("duration", durationInput.value);

            resultEl.innerHTML = '<p class="loading-text">Step 1/2: Generating music...</p>';
            showResult("pipeline-result");

            var genRes = await fetch("/api/generate", { method: "POST", body: genFormData });
            if (!genRes.ok) throw new Error("Generation failed");
            var genData = await genRes.json();

            resultEl.innerHTML = '<p class="loading-text">Step 2/2: Separating stems...</p>';

            var audioRes = await fetch(genData.url);
            var audioBlob = await audioRes.blob();

            var sepFormData = new FormData();
            sepFormData.append("file", audioBlob, "generated.wav");
            sepFormData.append("model", "htdemucs");

            var sepRes = await fetch("/api/separate", { method: "POST", body: sepFormData });
            if (!sepRes.ok) throw new Error("Separation failed");
            var sepData = await sepRes.json();

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
    var list = document.createElement("ul");
    list.className = "stem-list";

    var names = Object.keys(stems).sort();
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var url = stems[name];

        var li = document.createElement("li");
        var nameSpan = document.createElement("span");
        nameSpan.className = "stem-name";
        nameSpan.textContent = name;

        var audio = document.createElement("audio");
        audio.controls = true;
        audio.src = url;

        var dl = document.createElement("a");
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

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
}
