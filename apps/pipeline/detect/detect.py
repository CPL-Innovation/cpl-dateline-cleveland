"""SLICE-14 box-first layout detectors — the Python half.

Node shells out to this the way ocrAnchor shells out to tesseract: one process
per call, JSON on stdout, nothing persistent. That keeps the ingestion server
zero-dependency and puts every Python requirement behind one `uv run`.

  detect  --model american-stories|pp-doclayout --image PAGE.jpg
          → {"width","height","model","ms","boxes":[{"rect":[x,y,w,h],"label","conf","order"}]}
          rect is NORMALIZED 0-1, top-left + size — the same shape region_bbox stores.

  overlay --image PAGE.jpg --boxes BOXES.json --out OUT.jpg [--max-edge 1600]
          draws numbered boxes on a downscaled page. The grouping prompt reads it
          (the VLM names boxes by number and never emits a coordinate) and the
          detect CLI writes it for eyeballing a detector.

Both models run on onnxruntime's CPU provider. Neither needs torch, ultralytics
or paddle: the pre/post-processing each model needs is re-implemented here in
numpy, from the upstream code it mirrors (cited per function).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None  # archival masters are ~36 MP; that is expected, not a bomb

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def load_page(path: str, at_least: int) -> tuple[Image.Image, int, int]:
    """Open a page and return (RGB image, original width, original height).

    JPEG draft mode lets libjpeg decode at 1/2, 1/4 or 1/8 scale directly, which
    turns a multi-second full decode of a 5332x6845 master into a fraction of
    that. `at_least` is the long edge the caller will resample to, so the draft
    never drops below what the model needs.
    """
    img = Image.open(path)
    w0, h0 = img.size
    if img.format == "JPEG":
        scale = at_least / max(w0, h0)
        img.draft("RGB", (max(1, int(w0 * scale * 2)), max(1, int(h0 * scale * 2))))
    return img.convert("RGB"), w0, h0


# ── American Stories (Dell et al., 2023) ─────────────────────────────────────
# YOLOv8 exported to ONNX, trained on Chronicling America. Input 1280x1280
# letterboxed; output (1, 4 + 10, 33600) = cx, cy, w, h then one score per class.
# Mirrors get_layout_predictions + non_max_supression_yolov8 in
# dell-research-harvard/AmericanStories src/run_img2txt_yolo_pipeline.py.
AS_LABELS = [
    "article", "author", "cartoon_or_advertisement", "headline", "image_caption",
    "masthead", "newspaper_header", "page_number", "photograph", "table",
]
AS_SIZE = 1280
# Upstream runs conf 0.01 because it OCRs every crop downstream. A curator has to
# look at every box here, so the floor is higher; the agnostic IoU of 0.1 is kept
# from upstream — it is what stops one article coming back as nested duplicates.
AS_CONF = 0.20
AS_IOU = 0.10


def letterbox(img: Image.Image, size: int) -> tuple[np.ndarray, float, float, float]:
    w, h = img.size
    gain = min(size / w, size / h)
    nw, nh = round(w * gain), round(h * gain)
    canvas = Image.new("RGB", (size, size), (114, 114, 114))
    padx, pady = (size - nw) / 2, (size - nh) / 2
    canvas.paste(img.resize((nw, nh), Image.BILINEAR), (int(round(padx - 0.1)), int(round(pady - 0.1))))
    return np.asarray(canvas, dtype=np.float32), gain, padx, pady


def nms(boxes: np.ndarray, scores: np.ndarray, iou: float) -> list[int]:
    """Greedy NMS over xyxy boxes, highest score first."""
    order = scores.argsort()[::-1]
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    keep: list[int] = []
    while order.size:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy1 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx2 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy2 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        ov = inter / (area[i] + area[order[1:]] - inter + 1e-7)
        order = order[1:][ov <= iou]
    return keep


def detect_american_stories(path: str) -> dict:
    import onnxruntime as ort

    img, w0, h0 = load_page(path, AS_SIZE)
    x, gain, padx, pady = letterbox(img, AS_SIZE)
    x = (x / 255.0).transpose(2, 0, 1)[None]
    sess = ort.InferenceSession(str(MODELS_DIR / "american-stories-layout.onnx"), providers=["CPUExecutionProvider"])
    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0].T  # (33600, 14)

    scores = pred[:, 4:]
    cls = scores.argmax(1)
    conf = scores.max(1)
    m = conf >= AS_CONF
    pred, cls, conf = pred[m], cls[m], conf[m]
    cx, cy, bw, bh = pred[:, 0], pred[:, 1], pred[:, 2], pred[:, 3]
    xyxy = np.stack([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], 1)
    keep = nms(xyxy, conf, AS_IOU)

    # letterbox space → the decoded image → normalized page coordinates
    iw, ih = img.size
    out = []
    for i in keep:
        x1, y1, x2, y2 = xyxy[i]
        x1 = (x1 - padx) / gain / iw; x2 = (x2 - padx) / gain / iw
        y1 = (y1 - pady) / gain / ih; y2 = (y2 - pady) / gain / ih
        out.append(box(x1, y1, x2, y2, AS_LABELS[int(cls[i])], float(conf[i])))
    return {"width": w0, "height": h0, "boxes": out}


# ── PP-DocLayoutV3 (PaddlePaddle, Apache-2.0) ────────────────────────────────
# A DETR-family detector from PaddleOCR-VL-1.5. Per its inference.yml: resize to
# 800x800 WITHOUT keeping aspect ratio, scale to 0-1 (norm_type none = no mean/std),
# CHW. It is fed the scale factor and returns boxes already in ORIGINAL-image
# pixels as rows of [class, score, x1, y1, x2, y2, reading_order].
PP_LABELS = [
    "abstract", "algorithm", "aside_text", "chart", "content", "display_formula",
    "doc_title", "figure_title", "footer", "footer_image", "footnote",
    "formula_number", "header", "header_image", "image", "inline_formula",
    "number", "paragraph_title", "reference", "reference_content", "seal",
    "table", "text", "vertical_text", "vision_footnote",
]
PP_SIZE = 800
PP_CONF = 0.50  # inference.yml's own draw_threshold


def detect_pp_doclayout(path: str) -> dict:
    import onnxruntime as ort

    img, w0, h0 = load_page(path, PP_SIZE)
    iw, ih = img.size
    x = (np.asarray(img.resize((PP_SIZE, PP_SIZE), Image.BICUBIC), dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]
    sess = ort.InferenceSession(str(MODELS_DIR / "pp-doclayout-v3.onnx"), providers=["CPUExecutionProvider"])
    rows = sess.run(None, {
        "im_shape": np.array([[PP_SIZE, PP_SIZE]], np.float32),
        "image": x,
        "scale_factor": np.array([[PP_SIZE / ih, PP_SIZE / iw]], np.float32),
    })[0]
    rows = rows[rows[:, 1] >= PP_CONF]
    out = []
    for c, s, x1, y1, x2, y2, order in rows:
        b = box(x1 / iw, y1 / ih, x2 / iw, y2 / ih, PP_LABELS[int(c)], float(s))
        b["order"] = int(order)
        out.append(b)
    return {"width": w0, "height": h0, "boxes": out}


def box(x1: float, y1: float, x2: float, y2: float, label: str, conf: float) -> dict:
    x1, y1 = max(0.0, float(x1)), max(0.0, float(y1))
    x2, y2 = min(1.0, float(x2)), min(1.0, float(y2))
    return {
        "rect": [round(x1, 4), round(y1, 4), round(max(0.0, x2 - x1), 4), round(max(0.0, y2 - y1), 4)],
        "label": label,
        "conf": round(conf, 3),
    }


DETECTORS = {"american-stories": detect_american_stories, "pp-doclayout": detect_pp_doclayout}


# ── overlay ──────────────────────────────────────────────────────────────────
# Colour by GROUP when the boxes carry one (the curator's / grouper's view), by
# LABEL otherwise (the raw detector view). Numbers are what the VLM refers to, so
# they are drawn large, on an opaque tab, at the box's top-left inside the box.
PALETTE = [
    (230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180),
    (70, 190, 190), (240, 50, 230), (128, 128, 0), (0, 0, 128), (170, 110, 40),
    (128, 0, 0), (0, 128, 128),
]


def overlay(image: str, boxes_path: str, out: str, max_edge: int) -> dict:
    boxes = json.loads(Path(boxes_path).read_text())
    if isinstance(boxes, dict):
        boxes = boxes["boxes"]
    img, _, _ = load_page(image, max_edge)
    img.thumbnail((max_edge, max_edge), Image.LANCZOS)
    W, H = img.size
    draw = ImageDraw.Draw(img, "RGBA")
    fsize = max(12, W // 70)
    try:
        font = ImageFont.load_default(size=fsize)
    except TypeError:  # Pillow < 10.1
        font = ImageFont.load_default()

    keys = sorted({str(b.get("group", b.get("label"))) for b in boxes})
    colour = {k: PALETTE[i % len(PALETTE)] for i, k in enumerate(keys)}
    for b in boxes:
        x, y, w, h = b["rect"]
        r = (x * W, y * H, (x + w) * W, (y + h) * H)
        c = colour[str(b.get("group", b.get("label")))]
        draw.rectangle(r, outline=c + (255,), width=max(2, W // 500), fill=c + (28,))
    for b in boxes:  # numbers last so no rectangle paints over a label
        x, y, _, _ = b["rect"]
        c = colour[str(b.get("group", b.get("label")))]
        tag = str(b["id"])
        tx, ty = x * W + 3, y * H + 3
        l, t, rr, bb = draw.textbbox((tx, ty), tag, font=font)
        draw.rectangle((l - 3, t - 2, rr + 3, bb + 2), fill=c + (235,))
        draw.text((tx, ty), tag, fill=(255, 255, 255, 255), font=font)
    img.save(out, quality=88)
    return {"out": out, "width": W, "height": H}


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("detect")
    d.add_argument("--model", required=True, choices=sorted(DETECTORS))
    d.add_argument("--image", required=True)
    o = sub.add_parser("overlay")
    o.add_argument("--image", required=True)
    o.add_argument("--boxes", required=True)
    o.add_argument("--out", required=True)
    o.add_argument("--max-edge", type=int, default=1600)
    a = ap.parse_args()

    if a.cmd == "detect":
        t = time.perf_counter()
        res = DETECTORS[a.model](a.image)
        res["model"] = a.model
        res["ms"] = round((time.perf_counter() - t) * 1000)
        json.dump(res, sys.stdout)
    else:
        json.dump(overlay(a.image, a.boxes, a.out, a.max_edge), sys.stdout)


if __name__ == "__main__":
    main()
