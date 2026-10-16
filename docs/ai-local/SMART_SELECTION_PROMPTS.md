# N4 Smart Selection - Smart Brush and Lasso with SAM ViT-B

This patch extends the existing `smart-selection` operation so frontend tools can
use **brush strokes** and **lasso polygons** in addition to legacy point prompts.

No new Spring controller endpoint is required because N4 already exposes:

- `POST /api/ai/local/operations/smart-selection`

through the generic `operation` endpoint, where `params` is arbitrary JSON.

## Supported params

### 1) Legacy click points

```json
{
  "outputMode": "MASK_ONLY",
  "points": [
    {"x": 0.38, "y": 0.42, "label": 1},
    {"x": 0.66, "y": 0.52, "label": 0}
  ]
}
```

- format: `{ "x": number, "y": number, "label": 0 | 1 }`
- normalized coordinates in `[0, 1]`
- `label = 1` positive, `label = 0` negative

### 2) Smart Brush (paint over the object)

```json
{
  "outputMode": "MASK_ONLY",
  "positiveBrushStrokes": [
    [
      {"x": 0.30, "y": 0.28},
      {"x": 0.32, "y": 0.33},
      {"x": 0.34, "y": 0.40}
    ],
    [
      {"x": 0.36, "y": 0.45},
      {"x": 0.40, "y": 0.52}
    ]
  ],
  "negativeBrushStrokes": [
    [
      {"x": 0.56, "y": 0.60},
      {"x": 0.60, "y": 0.64}
    ]
  ]
}
```

Behavior:
- positive brush strokes are converted into positive point prompts;
- do NOT add a tight box around the brush marks: SAM is free to expand to the whole subject;
- negative brush strokes are converted into negative point prompts.

### 3) Lasso (draw around the object)

```json
{
  "outputMode": "MASK_ONLY",
  "lassoPolygon": [
    {"x": 0.18, "y": 0.18},
    {"x": 0.62, "y": 0.20},
    {"x": 0.66, "y": 0.84},
    {"x": 0.20, "y": 0.82}
  ]
}
```

Behavior:
- the polygon is converted into a box prompt;
- internal positive seed points are generated automatically;
- SAM returns the highest-scoring mask.

### 4) Explicit box

```json
{
  "outputMode": "MASK_ONLY",
  "box": {
    "x": 0.15,
    "y": 0.10,
    "width": 0.50,
    "height": 0.70
  }
}
```

or:

```json
{
  "outputMode": "MASK_ONLY",
  "box": [0.15, 0.10, 0.65, 0.80]
}
```

## Output modes

Same as existing N4 mask pipeline:

- `MASK_ONLY`
- `TRANSPARENT`
- `WHITE`
- `COLOR`

## Frontend guidance

Recommended editor tools:

1. **Smart Brush (+)**
   - user paints over the subject;
   - send stroke coordinates as `positiveBrushStrokes`.

2. **Erase Brush (-)**
   - user paints on wrong regions;
   - send them as `negativeBrushStrokes`.

3. **Lasso**
   - user draws around the target;
   - send the polygon as `lassoPolygon`.

4. **Refine Mask**
   - keep using existing `refine-mask` and `apply-mask` operations.

## Notes

- The patch does **not** require a new SAM checkpoint.
- Prompt coordinates are normalized, independent of viewport zoom.
- `MAX_MASK_POINTS` still caps prompt complexity.
- When both brush and lasso are provided, SAM receives both point prompts and a merged box prompt.

The installer also updates `LocalImageService.check()` to accept brush-only and lasso-only submissions.
