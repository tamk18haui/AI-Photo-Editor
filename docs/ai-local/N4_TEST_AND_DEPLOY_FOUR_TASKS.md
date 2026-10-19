# INSTALL / TEST — N4 FULL V3 Four Tasks

## Summary of exact changes

The installer modifies only FIVE existing files:
- `ai-runner/processors/face_regions.py` (expose 6 masks)
- `ai-runner/tests/test_face_regions_v3.py` (replace stale IRIS-unsupported assertion)
- `backend/.../ai/face/FaceStudioService.java` (allow 6 masks through Spring)
- `backend/src/test/.../ai/face/FaceStudioServiceTest.java` (replace stale IRIS-unsupported assertion)
- `backend/.../ai/controller/LocalAiController.java` (GET/cancel/retry LOCAL only)

Adds EIGHT new repo files: Python public-region tests; Java public-region tests; Java Local Job tests; TypeScript API client for N2; E2E Python CLI; three handoff docs under `docs/ai-local/`. No model checkpoints, Gemini files, JobService/Worker/Dispatcher, MySQL migrations, N3 History code, shared auth or Editor UI touched. Installer validates exact code anchors, preflights before writing, is idempotent and backs up existing changed sources under `.n4_four_tasks_backups` (do not push backups).

### Install (PowerShell)

```powershell
cd D:\DOWNLOAD\N4_FULL_V3_FOUR_TASKS   # extracted ZIP folder
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\INSTALL_N4_FOUR_TASKS.ps1 -RepoRoot E:\AI-Photo-Editor -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\INSTALL_N4_FOUR_TASKS.ps1 -RepoRoot E:\AI-Photo-Editor
```

**FIRST** check Git state. If `main` or other team changes modified any of the five files, installer stops safely rather than overwriting. If installing while working on a feature branch, commit or stash your own changes *before* switching branch. Do not use `git reset --hard`, `git add .` or force push.

### Automated tests on your real repo

```powershell
cd E:\AI-Photo-Editor\ai-runner
.\.venv\Scripts\python.exe -m pytest -q tests\test_face_regions_v3.py tests\test_face_regions_public_n4.py tests\test_makeup_hybrid_v3.py
cd ..\backend
.\mvnw.cmd test
```

All prior N4 full tests may be run again: `ai-runner\.venv\Scripts\python.exe -m pytest -q` and `backend\mvnw.cmd test` from their respective subfolders. **Offline tests alone do not establish Cloudinary E2E.**

### REAL Backend → MySQL → Python → Cloudinary E2E (requires your local services)

1. Start Spring Boot on 8081, Python Runner on 8010, MySQL, configure Cloudinary and matching `AI_RUNNER_TOKEN` on Backend/Runner. Use a real **portrait** with a visible face, original image <=20MiB. Logged-in JWT has access to project.
2. Run **on disposable test project**. Script asks for JWT hidden; do not post JWT online:

```powershell
cd D:\DOWNLOAD\N4_FULL_V3_FOUR_TASKS
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RUN_N4_E2E_REAL.ps1 `
  -RepoRoot 'E:\AI-Photo-Editor' `
  -Image 'D:\DOWNLOAD\anh_2_nguoi.jpg' `
  -CreateTestProject
```

Existing disposable Project/Asset instead:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\RUN_N4_E2E_REAL.ps1 `
  -RepoRoot 'E:\AI-Photo-Editor' -ProjectId 10 -AssetId 25
```

Replace `10`, `25` with **real IDs** of the same Project (never use placeholders verbatim). If your JWT is in a session-only `$env:N4_TEST_ACCESS_TOKEN`, the script will use it without prompt; after the run, remove it when done. The automatic `CreateTestProject` mode **creates persistent test Project and Assets** and never auto-deletes them; remove them later through normal app flow if appropriate. Be sure your account and Cloudinary storage are allowed to create test records.

Report saved to `E:\AI-Photo-Editor\n4-e2e-results\<timestamp>\N4_E2E_REAL_REPORT.json` with PASS/FAIL results and IDs, without JWT or full EditorState or Cloudinary URLs. If step fails, send the JSON and console log with credentials redacted. **PASS requires live services; script cannot synthesize a successful report.**

The E2E performs authenticated project access; reads original hash/EditorState; gets Face Detect and `SKIN/CHEEKS/IRIS` mask assets; creates real Makeup job; polls to completion; retrieves image from Cloudinary; confirms immutable original image and that Editor state is unchanged prior to Apply. This tests actual Spring/API + job/worker + runner + Cloudinary, **not the browser UI**. UI E2E belongs to N1/N2; N3 Apply/Undo/Redo cannot be end-to-end accepted until N3's separate branch is merged.

## Git operations (after both test suites PASS)

```powershell
cd E:\AI-Photo-Editor
git status -sb
git diff --check
# Work on a dedicated branch based on main; stage ONLY the 13 selected N4 files.
git diff --stat
```

Cross-team restrictions: do not commit `.n4_four_tasks_backups`, `n4-e2e-results`, `ai-runner/weights`, test uploads, any actual `.env` or JWT files, N5/Gemini code, N3 History or migrations. Upload handoff documentation to N2 through PR description or team docs after review.

## Acceptance gates

- [ ] Java/Python offline tests PASS after source patch
- [ ] HTTP six new mask regions permitted, `faceIndex` and dimensions validated
- [ ] HTTP Local Job cancel/retry returns correct owner/provider semantics
- [ ] Real E2E report `complete=true`, all steps PASS
- [ ] N2 receives `n4LocalAiApi.ts` and handoff
- [ ] N1 confirms JWT / `apiClient.ts` interceptor and port proxy
- [ ] N3 confirms Apply/History interface independently

No new Gemini dependency, no new DB tables, no forced shared provider. The asset mask quality is outside this four-task acceptance scope by user's instruction.
