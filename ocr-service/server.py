"""Local PaddleOCR service for SpendSense's optional "detailed read".

POST /ocr with a JPEG/PNG/WebP body -> {"text": "..."} (one receipt line per text line).
Images are processed in memory and never written to disk or logged.
Binds to 127.0.0.1 only; the backend is the sole caller.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
from paddleocr import PaddleOCR

HOST = os.environ.get("OCR_HOST", "127.0.0.1")
PORT = int(os.environ.get("OCR_PORT", "8765"))
MAX_BYTES = 6 * 1024 * 1024
MAX_SIDE = 1600  # measured: 1600px kept every summary line; 1200px dropped discount lines

# oneDNN needs paddlepaddle 3.2.x (3.3 raises ConvertPirAttribute2RuntimeAttribute on CPU).
ocr = PaddleOCR(
    lang="th",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    enable_mkldnn=True,
    cpu_threads=int(os.environ.get("OCR_THREADS", "8")),
)
lock = threading.Lock()  # one predictor; requests are serialized


def to_lines(result) -> str:
    """Group recognized boxes into visual lines (top-to-bottom, left-to-right)."""
    items = []
    for r in result:
        for box, text in zip(r["rec_polys"], r["rec_texts"]):
            ys, xs = box[:, 1], box[:, 0]
            items.append((float(ys.mean()), float(ys.max() - ys.min()), float(xs.min()), text))
    items.sort()
    lines, current, anchor = [], [], None
    for y, h, x, text in items:
        if anchor is not None and abs(y - anchor) > max(10.0, h * 0.6):
            lines.append(current)
            current = []
            anchor = None
        if anchor is None:
            anchor = y
        current.append((x, text))
    if current:
        lines.append(current)
    return "\n".join("  ".join(t for _, t in sorted(line)) for line in lines)


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._json(413, {"error": "image too large"})
        raw = self.rfile.read(length)
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return self._json(400, {"error": "invalid image"})
        h, w = image.shape[:2]
        scale = MAX_SIDE / max(h, w)
        if scale < 1:
            image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
        try:
            with lock:
                text = to_lines(ocr.predict(image))
        except Exception:  # never echo image-derived details
            return self._json(500, {"error": "ocr failed"})
        return self._json(200, {"text": text})

    def log_message(self, *args):  # no request logging (could include receipt metadata)
        pass


if __name__ == "__main__":
    print(f"SpendSense OCR service on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
