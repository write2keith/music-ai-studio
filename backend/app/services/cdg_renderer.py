import logging
import struct
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# CDG screen dimensions: 300 x 216 pixels
# Each tile is 6 columns x 12 rows = 72 pixels
# Grid: 50 columns x 18 rows
CDG_WIDTH = 300
CDG_HEIGHT = 216
TILE_COLS = 50
TILE_ROWS = 18
TILE_W = 6
TILE_H = 12

CDG_COMMAND = 0x09
CDG_MEMORY_PRESET = 0x06
CDG_BORDER_PRESET = 0x14
CDG_TILE_BLOCK_NORMAL = 0x1C
CDG_SCROLL_PRESET = 0x28
CDG_SCROLL_COPY = 0x2C
CDG_LOAD_CLUT_LOW = 0x38
CDG_LOAD_CLUT_HIGH = 0x3C
CDG_DEF_TRANS_COLOR = 0x30


# Simplified 6x12 bitmap font (uppercase A-Z, 0-9, space, common symbols)
# Each character is 12 rows of 6-bit columns (1 byte per row)
_FONT: dict[str, list[int]] = {}

def _build_font():
    base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'\"-:;&@#$%()[]{}<>/=+*^~"
    for ch in base:
        _FONT[ch] = [0] * 12

    # A
    _FONT["A"] = [0x0E, 0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11, 0x11, 0x00, 0x00, 0x00]
    # B
    _FONT["B"] = [0x1E, 0x11, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x11, 0x1E, 0x00, 0x00, 0x00]
    # C
    _FONT["C"] = [0x0E, 0x11, 0x10, 0x10, 0x10, 0x10, 0x10, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # D
    _FONT["D"] = [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E, 0x00, 0x00, 0x00]
    # E
    _FONT["E"] = [0x1F, 0x10, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10, 0x1F, 0x00, 0x00, 0x00]
    # F
    _FONT["F"] = [0x1F, 0x10, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10, 0x10, 0x00, 0x00, 0x00]
    # G
    _FONT["G"] = [0x0E, 0x11, 0x10, 0x10, 0x17, 0x11, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # H
    _FONT["H"] = [0x11, 0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11, 0x11, 0x00, 0x00, 0x00]
    # I
    _FONT["I"] = [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E, 0x00, 0x00, 0x00]
    # J
    _FONT["J"] = [0x07, 0x02, 0x02, 0x02, 0x02, 0x02, 0x12, 0x12, 0x0C, 0x00, 0x00, 0x00]
    # K
    _FONT["K"] = [0x11, 0x12, 0x14, 0x18, 0x10, 0x18, 0x14, 0x12, 0x11, 0x00, 0x00, 0x00]
    # L
    _FONT["L"] = [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F, 0x00, 0x00, 0x00]
    # M
    _FONT["M"] = [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11, 0x11, 0x11, 0x00, 0x00, 0x00]
    # N
    _FONT["N"] = [0x11, 0x11, 0x19, 0x15, 0x15, 0x13, 0x13, 0x11, 0x11, 0x00, 0x00, 0x00]
    # O
    _FONT["O"] = [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # P
    _FONT["P"] = [0x1E, 0x11, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10, 0x10, 0x00, 0x00, 0x00]
    # Q
    _FONT["Q"] = [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D, 0x00, 0x00, 0x00]
    # R
    _FONT["R"] = [0x1E, 0x11, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11, 0x11, 0x00, 0x00, 0x00]
    # S
    _FONT["S"] = [0x0E, 0x11, 0x10, 0x08, 0x06, 0x01, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # T
    _FONT["T"] = [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x00, 0x00]
    # U
    _FONT["U"] = [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # V
    _FONT["V"] = [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x0A, 0x04, 0x00, 0x00, 0x00]
    # W
    _FONT["W"] = [0x11, 0x11, 0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11, 0x00, 0x00, 0x00]
    # X
    _FONT["X"] = [0x11, 0x11, 0x0A, 0x0A, 0x04, 0x0A, 0x0A, 0x11, 0x11, 0x00, 0x00, 0x00]
    # Y
    _FONT["Y"] = [0x11, 0x11, 0x0A, 0x0A, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x00, 0x00]
    # Z
    _FONT["Z"] = [0x1F, 0x01, 0x02, 0x02, 0x04, 0x04, 0x08, 0x10, 0x1F, 0x00, 0x00, 0x00]
    # 0
    _FONT["0"] = [0x0E, 0x11, 0x13, 0x15, 0x15, 0x19, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # 1
    _FONT["1"] = [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E, 0x00, 0x00, 0x00]
    # 2
    _FONT["2"] = [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10, 0x1F, 0x00, 0x00, 0x00]
    # 3
    _FONT["3"] = [0x0E, 0x11, 0x01, 0x06, 0x01, 0x01, 0x01, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # 4
    _FONT["4"] = [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02, 0x02, 0x02, 0x00, 0x00, 0x00]
    # 5
    _FONT["5"] = [0x1F, 0x10, 0x10, 0x1E, 0x01, 0x01, 0x01, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # 6
    _FONT["6"] = [0x06, 0x08, 0x10, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # 7
    _FONT["7"] = [0x1F, 0x01, 0x02, 0x02, 0x04, 0x04, 0x04, 0x08, 0x08, 0x00, 0x00, 0x00]
    # 8
    _FONT["8"] = [0x0E, 0x11, 0x11, 0x0E, 0x0E, 0x11, 0x11, 0x11, 0x0E, 0x00, 0x00, 0x00]
    # 9
    _FONT["9"] = [0x0E, 0x11, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x02, 0x0C, 0x00, 0x00, 0x00]
    # Space
    _FONT[" "] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    # .
    _FONT["."] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C, 0x00, 0x00, 0x00]
    # ,
    _FONT[","] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C, 0x08, 0x00, 0x00]
    # !
    _FONT["!"] = [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00, 0x00, 0x00]
    # ?
    _FONT["?"] = [0x0E, 0x11, 0x01, 0x02, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00, 0x00, 0x00]
    # '
    _FONT["'"] = [0x04, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    # "
    _FONT['"'] = [0x0A, 0x0A, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    # -
    _FONT["-"] = [0x00, 0x00, 0x00, 0x00, 0x0E, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    # &
    _FONT["&"] = [0x0C, 0x12, 0x12, 0x0C, 0x12, 0x12, 0x12, 0x12, 0x0D, 0x00, 0x00, 0x00]
    # (
    _FONT["("] = [0x02, 0x04, 0x08, 0x08, 0x08, 0x08, 0x08, 0x04, 0x02, 0x00, 0x00, 0x00]
    # )
    _FONT[")"] = [0x08, 0x04, 0x02, 0x02, 0x02, 0x02, 0x02, 0x04, 0x08, 0x00, 0x00, 0x00]
    # =
    _FONT["="] = [0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    # /
    _FONT["/"] = [0x01, 0x02, 0x02, 0x04, 0x04, 0x04, 0x08, 0x08, 0x10, 0x00, 0x00, 0x00]

    for ch in base:
        if _FONT.get(ch) and _FONT[ch][0] == 0:
            _FONT[ch] = [0x00] * 6 + _FONT[ch][6:] if len([r for r in _FONT[ch] if r != 0]) == 0 else _FONT[ch]


def _get_font_char(ch: str) -> list[int]:
    if not _FONT:
        _build_font()
    upper = ch.upper()
    if upper in _FONT:
        return _FONT[upper]
    return _FONT[" "]


def _make_packet(instruction: int, data: bytes) -> bytes:
    packet = bytearray(24)
    packet[0] = CDG_COMMAND
    packet[1] = instruction
    # parity bytes at 2-3, leave as 0
    packet[4:20] = data[:16].ljust(16, b"\x00")
    return bytes(packet)


def _packet_memory_preset(color: int, repeat: int) -> bytes:
    return _make_packet(CDG_MEMORY_PRESET, bytes([color & 0x0F, repeat & 0x0F, 0, 0]))


def _packet_border_preset(color: int) -> bytes:
    return _make_packet(CDG_BORDER_PRESET, bytes([color & 0x0F, 0, 0, 0]))


def _packet_tile_block(color0: int, color1: int, row: int, col: int, tile_data: bytes) -> bytes:
    data = bytearray([color0 & 0x0F, color1 & 0x0F, row & 0x1F, col & 0x3F])
    data.extend(tile_data[:12].ljust(12, b"\x00"))
    return _make_packet(CDG_TILE_BLOCK_NORMAL, bytes(data[:16]))


def _packet_scroll_preset(color: int, h_scroll: int = 0, v_scroll: int = 0) -> bytes:
    return _make_packet(CDG_SCROLL_PRESET, bytes([color & 0x0F, h_scroll & 0x07, v_scroll & 0x0F, 0]))


def _packet_scroll_copy() -> bytes:
    return _make_packet(CDG_SCROLL_COPY, bytes(16))


def _packet_load_clut_low(colors: list[tuple[int, int, int]]) -> bytes:
    data = bytearray()
    for idx in range(8):
        if idx < len(colors):
            r, g, b = colors[idx]
        else:
            r = g = b = 0
        r4 = min(15, r >> 4)
        g4 = min(15, g >> 4)
        b4 = min(15, b >> 4)
        high = ((r4 & 0x0F) << 4) | (g4 & 0x0F)
        low = ((b4 & 0x0F) << 4) | (0)
        data.append(high)
        data.append(low)
    return _make_packet(CDG_LOAD_CLUT_LOW, bytes(data[:16]))


def _packet_load_clut_high(colors: list[tuple[int, int, int]]) -> bytes:
    data = bytearray()
    for idx in range(8, 16):
        if idx < len(colors):
            r, g, b = colors[idx]
        else:
            r = g = b = 0
        r4 = min(15, r >> 4)
        g4 = min(15, g >> 4)
        b4 = min(15, b >> 4)
        high = ((r4 & 0x0F) << 4) | (g4 & 0x0F)
        low = ((b4 & 0x0F) << 4) | (0)
        data.append(high)
        data.append(low)
    return _make_packet(CDG_LOAD_CLUT_HIGH, bytes(data[:16]))


# Standard karaoke CDG color palette
STD_PALETTE: list[tuple[int, int, int]] = [
    (0, 0, 0),        # 0: Black (background)
    (255, 255, 255),  # 1: White (text)
    (0, 100, 255),    # 2: Blue (sweep bg)
    (0, 255, 200),    # 3: Cyan (active word)
    (255, 100, 255),  # 4: Pink
    (255, 255, 0),    # 5: Yellow
    (255, 50, 50),    # 6: Red
    (50, 255, 50),    # 7: Green
    (0, 0, 0),        # 8-15 unused
    (0, 0, 0),
    (0, 0, 0),
    (0, 0, 0),
    (0, 0, 0),
    (0, 0, 0),
    (0, 0, 0),
    (0, 0, 0),
]


def _init_screen() -> list[bytes]:
    packets: list[bytes] = []
    packets.append(_packet_memory_preset(0, 0))
    packets.append(_packet_border_preset(0))
    packets.append(_packet_load_clut_low(STD_PALETTE))
    packets.append(_packet_load_clut_high(STD_PALETTE))
    return packets


def _render_text(text: str, start_col: int, row: int, color0: int, color1: int) -> list[bytes]:
    packets: list[bytes] = []
    if not text:
        return packets
    text = text.upper()
    for i, ch in enumerate(text):
        col = start_col + i
        if col >= TILE_COLS:
            break
        font_data = _get_font_char(ch)
        tile = bytearray()
        for r in range(12):
            row_byte = font_data[r] & 0x3F
            tile.append(row_byte)
        packets.append(_packet_tile_block(color0, color1, row, col, bytes(tile[:12])))
    return packets


def _render_line(text: str, row: int, color_bg: int = 0, color_fg: int = 1) -> list[bytes]:
    max_chars = TILE_COLS
    visible = text[:max_chars]
    start_col = max(0, (TILE_COLS - len(visible)) // 2)
    return _render_text(visible, start_col, row, color_bg, color_fg)


def _render_line_sweep(text: str, row: int, sweep_frac: float, color_bg: int = 0, color_fg: int = 1, color_sweep: int = 3) -> list[bytes]:
    """Render line with a color sweep from left to right based on sweep_frac (0-1)."""
    max_chars = TILE_COLS
    visible = text[:max_chars]
    start_col = max(0, (TILE_COLS - len(visible)) // 2)
    packets: list[bytes] = []

    sweep_chars = int(len(visible) * sweep_frac)
    for i, ch in enumerate(visible):
        col = start_col + i
        if col >= TILE_COLS:
            break
        fg = color_sweep if i < sweep_chars else color_fg
        bg = color_bg
        font_data = _get_font_char(ch)
        tile = bytearray()
        for r in range(12):
            tile.append(font_data[r] & 0x3F)
        packets.append(_packet_tile_block(bg, fg, row, col, bytes(tile[:12])))
    return packets


def render_cdg(
    lines: list[dict],
    total_duration_s: float,
    output_path: str,
    title: str = "Karaoke",
    frames_per_second: int = 15,
) -> str:
    """Render a CDG file from lyric lines with word-level timestamps.

    Args:
        lines: List of dicts with keys: start, end, words (list of dicts with word, start, end)
        total_duration_s: Total audio duration in seconds
        output_path: Path to write .cdg file
        title: Song title
        frames_per_second: CDG frame rate (typically 15)
    Returns:
        Path to the generated .cdg file
    """
    if not lines:
        logger.warning("No lyrics lines provided for CDG rendering")
        return output_path

    total_frames = int(total_duration_s * frames_per_second)
    if total_frames < 1:
        total_frames = 1

    # Pre-compute which frame each event happens on
    frame_events: dict[int, list[tuple[int, str]]] = {}
    for row_idx, line in enumerate(lines):
        start_f = int(line["start"] * frames_per_second)
        end_f = int(line["end"] * frames_per_second)
        text = " ".join(w["word"] for w in line.get("words", []))
        if not text:
            continue
        # Map to row (maximum 2 lines displayed at a time)
        display_row = 7 + (row_idx % 2) * 2

        # Show the line at start frame
        if start_f not in frame_events:
            frame_events[start_f] = []
        frame_events[start_f].append((display_row, text))

        # Generate word-level sweep events
        words = line.get("words", [])
        if words:
            for w in words:
                wf = int(w["start"] * frames_per_second)
                if wf not in frame_events:
                    frame_events[wf] = []

    # Clear previous lines when new line starts
    for line in lines:
        end_f = int(line["end"] * frames_per_second)
        if end_f not in frame_events:
            frame_events[end_f] = []
        # Clear the row at end
        display_row = 7 + (lines.index(line) % 2) * 2
        frame_events[end_f].append((-display_row - 1, ""))

    packets: list[bytes] = []
    packets.extend(_init_screen())

    # Title screen
    packets.extend(_render_line(title.upper(), 6, 0, 5))
    packets.extend(_render_line("- KARAOKE -", 8, 0, 3))
    empty_title = 3 * frames_per_second
    for _ in range(empty_title):
        packets.extend([_packet_scroll_copy()] if False else [])

    # Track active display state
    active_texts: dict[int, str] = {}
    current_line_row = 7
    prev_active_row = -1

    for f in range(total_frames):
        if f in frame_events:
            for evt in frame_events[f]:
                row, text = evt
                if row < 0:
                    # Clear request
                    clear_row = -row - 1
                    active_texts.pop(clear_row, None)
                else:
                    active_texts[row] = text
                    current_line_row = row

        # Determine which rows to render (2 lines max)
        render_rows = sorted(active_texts.items())
        if len(render_rows) > 2:
            render_rows = render_rows[-2:]

        # Build frame packets
        frame_pkts: list[bytes] = []

        for row, text in render_rows:
            words = []
            # Find the corresponding line to get word timestamps
            for line in lines:
                line_text = " ".join(w["word"] for w in line.get("words", []))
                if line_text == text:
                    words = line.get("words", [])
                    break

            current_time = f / frames_per_second
            sweep_frac = 0.0
            if words:
                active_w = -1
                for wi, w in enumerate(words):
                    if current_time >= w["start"] and current_time < w["end"]:
                        active_w = wi
                        word_dur = w["end"] - w["start"]
                        if word_dur > 0:
                            sweep_frac = (wi + (current_time - w["start"]) / word_dur) / len(words)
                        break
                    if current_time < w["start"]:
                        break
                if active_w < 0:
                    # Check if all words passed
                    if current_time >= words[-1]["end"]:
                        sweep_frac = 1.0
                    else:
                        sweep_frac = 0.0

            row_is_active = (row == current_line_row)
            if row_is_active:
                frame_pkts.extend(_render_line_sweep(text, row, sweep_frac, 0, 1, 3))
            else:
                frame_pkts.extend(_render_line(text, row, 0, 1))

        packets.extend(frame_pkts)

        # Add CDG padding packets to maintain frame rate
        # Each frame needs 4 packets minimum (CDG spec: 300 bytes per sector, 4 packets per sector)
        if not frame_pkts:
            pass

    # Ensure output directory exists
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Each CDG sector must be exactly 96 bytes (4 packets * 24 bytes)
    # Pad with Memory Preset no-op if needed
    while len(packets) % 4 != 0:
        packets.append(_packet_memory_preset(0, 0))

    all_packets = b"".join(packets)
    with open(output_path, "wb") as f:
        f.write(all_packets)

    logger.info(f"CDG rendered: {len(packets)} packets, {total_frames} frames -> {output_path}")
    return output_path


def render_cdg_from_lyrics_data(
    lines_data: list[dict],
    duration: float,
    audio_filename: str,
    output_dir: str = "output/lyrics",
) -> dict:
    """Render CDG from structured lyrics data. Returns paths to .cdg and .mp3."""
    import shutil
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    base_name = Path(audio_filename).stem
    cdg_path = str(out / f"{base_name}_karaoke.cdg")
    mp3_src = str(Path(audio_filename))
    mp3_dst = str(out / f"{base_name}_karaoke.mp3")

    render_cdg(lines_data, duration, cdg_path, title=base_name)

    # Copy audio if accessible
    if Path(mp3_src).exists() and mp3_src != mp3_dst:
        try:
            shutil.copy2(mp3_src, mp3_dst)
        except Exception:
            pass

    return {
        "cdg_path": cdg_path,
        "cdg_url": f"/api/audio/{Path(cdg_path).name}",
        "mp3_path": mp3_dst,
        "mp3_url": f"/api/audio/{Path(mp3_dst).name}" if Path(mp3_dst).exists() else "",
    }
