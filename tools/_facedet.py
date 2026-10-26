"""Shared MediaPipe face detection (short-range BlazeFace) with an upscaled top-half fallback.

BlazeFace short-range needs the face to fill a good part of the frame. Full-body outfit shots (face small
at the top) get a second try on an upscaled crop of the top part of the frame. The "full range" model is
NOT used: MediaPipe Tasks cannot run it (RET_CHECK failure in tensors_to_detections_calculator).
"""
import numpy as np

from _common import model_file

BASE = "https://storage.googleapis.com/mediapipe-models/face_detector/"
SHORT = ("blaze_face_short_range.tflite", BASE + "blaze_face_short_range/float16/latest/blaze_face_short_range.tflite")

# (fraction of frame height kept from the top, upscale factor) tried in order when the full frame has no face
FALLBACK_CROPS = ((0.5, 2.0), (0.34, 3.0))
MAX_SIDE = 1600


class FaceFinder:
    def __init__(self, min_conf=0.4):
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        self._mp = mp
        path = model_file(*SHORT)
        opts = vision.FaceDetectorOptions(
            base_options=mpt.BaseOptions(model_asset_path=path),
            running_mode=vision.RunningMode.IMAGE, min_detection_confidence=min_conf)
        self._det = vision.FaceDetector.create_from_options(opts)

    def _raw(self, rgb):
        img = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        out = []
        for d in self._det.detect(img).detections:
            b = d.bounding_box
            out.append((float(b.origin_x), float(b.origin_y), float(b.width), float(b.height)))
        return out

    def detect_all(self, rgb, fallback=True):
        """rgb: HxWx3 uint8. Returns [[x, y, w, h], ...] normalised 0..1 (all faces), plus the stage used."""
        import cv2
        H, W = rgb.shape[:2]
        boxes = [(x, y, w, h) for x, y, w, h in self._raw(rgb)]
        stage = "full"
        if not boxes and fallback:
            for frac, up in FALLBACK_CROPS:
                ch = max(32, int(H * frac))
                crop = rgb[:ch]
                nw, nh = int(W * up), int(ch * up)
                if max(nw, nh) > MAX_SIDE:
                    s = MAX_SIDE / max(nw, nh)
                    nw, nh = int(nw * s), int(nh * s)
                big = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_CUBIC)
                found = self._raw(big)
                if found:
                    sx, sy = W / nw, ch / nh
                    boxes = [(x * sx, y * sy, w * sx, h * sy) for x, y, w, h in found]
                    stage = f"crop{int(frac * 100)}"
                    break
        res = []
        for x, y, w, h in boxes:
            x0, y0 = max(0.0, x / W), max(0.0, y / H)
            x1, y1 = min(1.0, (x + w) / W), min(1.0, (y + h) / H)
            if x1 > x0 and y1 > y0:
                res.append([x0, y0, x1 - x0, y1 - y0])
        return res, stage
