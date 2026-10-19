# N4 FULL V3 — API handoff N2 (2026-10-18)

**Scope:** N4 Local AI only. Gemini/N5 is independent. API Server Spring Boot `http://localhost:8081/api` (port may differ by deployment). Frontend Axios `apiClient` has `baseURL='/api'`, add auth JWT Bearer interceptor from N1. Python Runner port 8010 and `AI_RUNNER_TOKEN` are **private**; never call it from browser.

## N1 prerequisite: immutable Project Asset

1. Authenticate using `/api/auth/login` or register (N1), keep an access token.
2. Current Editor must load project ID from route `/editor/:projectId` and upload image through `POST /api/projects/{projectId}/assets` multipart field **`file`**. Server returns `assetId`, `url`, `width`, `height`, `assetType`.
3. Pass **projectId + assetId**, not raw `File`, blob URL or arbitrary Cloudinary URL, to every N4 operation.
4. Vite `frontend/vite.config.ts` on main currently proxies `/api` to **8080**, while known N3 backend runs **8081**; N1 must align in its environment. N4 integration kit intentionally does not edit Vite config or shared auth files.

## Face Regions

`POST /api/ai/local/face-detect` request:
```json
{"projectId":12,"assetId":37}
```
Response (representative values):
```json
{"projectId":12,"assetId":37,"imageWidth":1200,"imageHeight":800,"faces":[{"faceIndex":0,"boundingBox":{"x":0.2,"y":0.2,"width":0.4,"height":0.6}}]}
```

`POST /api/ai/local/face-regions` request:
```json
{"projectId":12,"assetId":37,"faceIndex":0,"regions":["SKIN","LIPS","CHEEKS","IRIS"],"outputMode":"REGION_MASK"}
```
Returns `masks[]` with `region`, `maskAssetId`, `url`, `width`, `height`, and echoes `baseRevisionId` if provided. Each mask is an **8-bit single-channel PNG of EXACT original asset dimensions** (255 affected / 0 protected). Image coordinates: `boundingBox` and normalized SAM points are **0..1**, do not send CSS pixels. Fetch only masks required by selected effect to avoid large batch limits.

Public 22 regions:
`LIPS`, `UPPER_LIP`, `LOWER_LIP`, `HAIR`, `LEFT_EYE`, `RIGHT_EYE`, `EYELIDS`, `EYEBROWS`, `LEFT_EYEBROW`, `RIGHT_EYEBROW`, `SKIN`, `FACE`, `NOSE`, `TEETH`, `EARS`, `NECK`, **`CHEEKS`, `LEFT_CHEEK`, `RIGHT_CHEEK`, `IRIS`, `LEFT_IRIS`, `RIGHT_IRIS`**.

`LEFT_...` / `RIGHT_...` are names from the detector's anatomical/face-parsing convention, not necessarily screen left/right. N2 should verify orientation visually. On old or missing iris landmarks, API returns error `REGION_UNAVAILABLE` rather than fake result.

`POST /api/ai/local/face-landmarks` takes `{projectId,assetId}` for more detailed landmark geometry.

## Hybrid Makeup (N2 realtime Preview, N4 FINAL)

N2 renders fast preview locally on Canvas using downloaded mask + RGBA color blend. **Do not submit a server Job on every slider change**. Clicking **Render / Preview final** calls:

`POST /api/ai/local/makeup`
```json
{
  "projectId":12,"assetId":37,"faceIndex":0,"baseRevisionId":5,
  "outputMode":"FINAL",
  "effects":[
    {"effect":"BLUSH","intensity":0.45,"color":"#E88B98","feather":0.1,"blendMode":"NORMAL"},
    {"effect":"LIPSTICK","intensity":0.6,"color":"#D43F68","feather":0.1}
  ]
}
```
Response **202**: `{"jobId":126,"status":"QUEUED"}`.

12 supported effects: `LIPSTICK`,`LIP_GLOSS`,`EYESHADOW`,`EYELINER`,`EYEBROW_COLOR`,`BLUSH`,`FOUNDATION`,`SKIN_SMOOTH`,`HAIR_COLOR`,`TEETH_WHITEN`,`EYE_COLOR`,`FACE_RELIGHT`.

- `intensity`: **required** 0..1; `feather`: 0..1; `color`: optional `#RRGGBB`; `blendMode`: NORMAL/MULTIPLY/OVERLAY/SOFT_LIGHT/SCREEN.
- N4 internally supports 6 cheek/iris masks. For now **omit `sourceFaceMaskAssetIds`**: passing non-empty array is rejected `UNSUPPORTED_MAKEUP_MASKS`.
- `outputMode='PREVIEW'` also submits a server Job. N2's **real-time UI preview** is client-side.
- No automatic Apply: `resultAssetId` and `resultUrl` remain preview material until user confirms.

## Smart Brush, Lasso and Remove Object

`POST /api/ai/local/operations/smart-selection`:
```json
{"projectId":12,"assetId":37,"params":{"positiveBrushStrokes":[[{"x":0.4,"y":0.45},{"x":0.43,"y":0.49}]],"lassoPolygon":[{"x":0.2,"y":0.3},{"x":0.6,"y":0.3},{"x":0.6,"y":0.7}],"outputMode":"MASK_ONLY"}}
```
A `COMPLETED` Job with `resultAssetId` of `MASK` can be used as:

`POST /api/ai/local/operations/remove-object`
```json
{"projectId":12,"assetId":37,"params":{"maskAssetId":59,"method":"LAMA"}}
```
Do **not** invent a mask ID: use actual saved `MASK` asset in the same project. Mask source geometry must match exact image asset size.

Other Local endpoints: `POST /api/ai/upscale` (`scale: 2|4`, optional tileSize), `/api/ai/remove-background` (`outputMode: TRANSPARENT|WHITE|COLOR|MASK_ONLY`), `/api/ai/face-restore` (`fidelity 0..1`), `/api/ai/denoise`, `/api/ai/auto-enhance`.

## Job lifecycle in N2

`GET /api/ai/local/jobs/{jobId}` => `{jobId,projectId,type,provider,status,progress,stage,inputAssetId,resultAssetId,resultUrl,errorCode,error,...}`.

- `QUEUED` / `RUNNING`: poll ~1.5s; don't block browser.
- `COMPLETED`: require `provider='LOCAL'`, `resultAssetId>0`, `resultUrl` nonempty; show before/after.
- `FAILED` / `CANCELLED`: stop polling; show error, Retry button.
- `POST /api/ai/local/jobs/{jobId}/cancel`: returns updated JobView, only `LOCAL` of logged-in owner.
- `POST /api/ai/local/jobs/{jobId}/retry`: returns **202** new `{jobId,status}`. Retry only if original Job failed or was cancelled. Switching to Gemini is impossible through these endpoints.
- `GET /api/ai/local/capabilities`: discover model verification and `makeupEffects`. `MagicTouch` may be NOT_INSTALLED; do not promise that feature.

Errors: `401 AUTH_TOKEN_EXPIRED`, `403 FORBIDDEN`, `404 AI_JOB_NOT_FOUND` (wrong owner/provider), `409 AI_JOB_INVALID_STATE` (cancel completed or retry active), `422 UNSUPPORTED_FACE_REGION`, `422 FACE_INDEX_INVALID`, `422 INVALID_MAKEUP`, `422 UNSUPPORTED_MAKEUP_MASKS`, `502 AI_RUNNER_UNAVAILABLE`, `503 AI_RUNNER_NOT_CONFIGURED` / model unavailable; actual codes may vary by validation branch. Always display safe error messages, never token/stack trace.

## N3 Apply / History dependency

N3's **separate** branch `feature/n3-layer-history` defines `POST /api/projects/{projectId}/layers/from-ai-job` with `{jobId,name?,visible?,opacity?}` to create one non-destructive layer, History before/after and Undo/Redo. **That route is not in `main` at time of this handoff**; N1/N2 must not call it until N3 merges/deploys it and confirms contract. Do not directly modify state from N4 Job completion.

## Typical N2 React workflow (pseudo TypeScript)

```ts
import { n4LocalAiApi } from '../services/n4LocalAiApi';
const asset = {projectId, assetId}; // IDs returned from N1 Project/Asset
const detection = await n4LocalAiApi.detectFaces(asset);
const selectedFaceIndex = detection.faces[0].faceIndex;
const masks = await n4LocalAiApi.faceRegions({...asset, faceIndex: selectedFaceIndex, regions:['LIPS','CHEEKS','IRIS']});
// N2: paint Canvas overlay using masks.masks[*].url without calling server for every slider movement
const receipt = await n4LocalAiApi.renderMakeup({...asset,faceIndex:selectedFaceIndex,
  effects:[{effect:'LIPSTICK',intensity:0.6,color:'#D43F68'}],outputMode:'FINAL'});
const completed = await n4LocalAiApi.waitForJob(receipt.jobId);
// Show completed.resultUrl in temporary preview; let user choose Apply or discard.
// After N3 API deploys and user clicks Apply, submit completed.jobId to N3's adapter.
```

**File to cherry-pick for N2:** `frontend/src/services/n4LocalAiApi.ts`. It does not edit `EditorPage.tsx` or `apiClient.ts`; N1/N2 keep their existing frontend ownership. Review and merge API contract changes with N3; this handoff document does not overwrite existing YAML.
