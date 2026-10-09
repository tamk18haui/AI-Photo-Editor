# N1 Lumina Studio ↔ N3 Spring Boot — điểm tích hợp (09/10/2026)

## Git state used for this package

User-provided `git branch -avv` / `git log --all`:
- `origin/main` / `origin/develop`: `72140ec` — initial monorepo.
- `origin/feature/duyen-editor-core`: `f6d4ec6` — `feat(frontend): implement Lumina Studio UI`.
- `origin/feature/n3-backend-core`: `72140ec` — branch has no N3 commits yet.

**Cảnh báo:** ChatGPT GitHub connector has no private repository read access. We did **not** import the actual `f6d4ec6` source tree into this package. Do not treat this as a tested merge or as verification of every Frontend file. The N1 `LoginPage.tsx` available from a separate earlier file has a TODO for backend calls; assume the UI is not yet wired until N1 confirms.

## N1 LoginPage — expected requests

POST `/api/auth/register` JSON: `{ "email": "a@example.com", "password": "Password123!", "displayName": "Tên" }` → 201 + `AuthResponse`.
POST `/api/auth/login` JSON: `{ "email": "a@example.com", "password": "Password123!" }` → 200 + `AuthResponse`.

`AuthResponse` contains top-level `accessToken`, `refreshToken`, `tokenType: "Bearer"`, `expiresIn`, `userId`, optional `displayName` (no wrapper like `data.data`).

N1 should call `/api` via shared API client, attach `Authorization: Bearer <accessToken>`, retry refresh once on 401, then logout if refresh fails. The frontend should **not** hard-code `/editor/1` for real users: call POST `/api/projects` to get the actual project ID or use an existing project ID from GET `/api/projects`.

The current N1 LoginPage OAuth button/Google text does not mean Google sign-in is active. N3 has an *optional* feature-flagged route proposal; integration requires team approval and OAuth configuration.

## Vite local proxy (N1 owns file; DO NOT auto-overwrite frontend)

In `frontend/vite.config.ts`, review existing configuration and merge **only if no proxy exists**:

```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:8080', changeOrigin: true },
  },
},
```

If N1 uses a different frontend port, add the exact origin to `FRONTEND_ORIGINS`. Do not expose JWT signing secret, Cloudinary secret or DB password through Vite.

## Editor persistence

GET `/api/projects/{projectId}/state` returns **EditorState JSON directly**.
PUT `/api/projects/{projectId}/state` body is EditorState JSON (required `schemaVersion`, `canvas`, `objects`), response is `SaveStateResponse {projectId,savedAt,stateVersion}`. Objects, filters and layers should be serialized in the state JSON and restored by N1. Crop/rotate/adjust/filter continue to run locally in React.

## Project / Asset division

N3 handles project name, canvas dimensions, state, ownership. N4 handles assets, Cloudinary upload/deletion and AssetResponse. Thumbnail/avatar URL resolution requires N4's `AssetReferenceResolver` implementation. N5 handles Gemini/Natural Edit/AI Job endpoints.

OpenAPI truth: `docs/contracts/07_API_CONTRACT_v2_1_CLOUDINARY_FINAL.yaml`. Semantic constraints: `08_FE_BE_INTEGRATION_CONSTRAINTS_v1.yaml`. Do not alter either through N3 installation.
