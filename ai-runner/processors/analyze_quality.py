"""Image quality metrics and conservative enhancement recommendations."""
import cv2
import numpy as np
from PIL import Image


def run(image: Image.Image, args: dict | None = None) -> dict:
    """Return contract-compatible normalized brightness/contrast and blur metrics."""
    rgb = np.asarray(image.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray_small = cv2.resize(gray, (min(gray.shape[1], 1024), min(gray.shape[0], 1024)))
    brightness = float(np.mean(gray_small) / 255)
    contrast = float(np.std(gray_small) / 127.5)
    sharp = float(cv2.Laplacian(gray_small, cv2.CV_64F).var())
    smooth = cv2.GaussianBlur(gray_small, (3, 3), 0)
    noise = float(np.median(np.abs(gray_small.astype(np.float32) - smooth)) / 255)
    recommendations = []
    if brightness < 0.30: recommendations.append("BRIGHTNESS_UP")
    if noise > 0.045: recommendations.append("DENOISE")
    if sharp < 65: recommendations.append("SHARPEN")
    return {"brightness":round(brightness, 4),"contrast":round(min(contrast, 1.0), 4),
            "blurScore":round(sharp, 3),"noiseScore":round(noise, 5),
            "width":image.width,"height":image.height,"faceCount":count_faces(gray_small),
            "recommendations":recommendations}


def count_faces(gray: np.ndarray) -> int:
    """Count faces with bundled OpenCV Haar cascade (no network downloads)."""
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if cascade.empty(): return 0
    return len(cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(32, 32)))


def detect_faces(image: Image.Image) -> dict:
    """Return normalized face rectangles for Face Studio selection, not merely a count."""
    rgb = np.asarray(image.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if detector.empty():
        raise RuntimeError("OpenCV face cascade not installed")
    rectangles = detector.detectMultiScale(gray, 1.1, 5, minSize=(32,32))
    faces = [{"x":round(int(x)/image.width,5), "y":round(int(y)/image.height,5),
              "width":round(int(w)/image.width,5),"height":round(int(h)/image.height,5)}
             for x,y,w,h in rectangles]
    return {"width":image.width,"height":image.height,"faceCount":len(faces),"faces":faces}
