# Environment configuration: Spring Boot ↔ Python AI Runner

> Scope: automatic `.env` loading, a shared internal token and a stable local URL.
> Keep secrets out of Git. Do **not** copy one component's entire `.env` into the other.

## 1. Python runner — `ai-runner/.env`

```powershell
cd E:\AI-Photo-Editor\ai-runner
Copy-Item .env.example .env
notepad .env
```

Example contents (replace the token with a real random secret):

```dotenv
AI_RUNNER_TOKEN=REPLACE_WITH_A_LONG_RANDOM_SECRET
AI_RUNNER_PORT=8010
AI_WEIGHTS_DIR=
AI_INPUT_MAX_BYTES=20971520
AI_OUTPUT_MAX_BYTES=83886080
AI_MAX_INPUT_PIXELS=40000000
AI_MAX_OUTPUT_PIXELS=80000000
AI_MAX_SELECTION_POINTS=64
```

`run.py` now automatically loads `ai-runner/.env` via `python-dotenv`, regardless
of the working directory. Existing OS environment variables override `.env`.
The default `AI_WEIGHTS_DIR` is the runner's `weights/` directory. Relative
paths are resolved from `ai-runner/`, not the current PowerShell directory.

```powershell
cd E:\AI-Photo-Editor\ai-runner
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe run.py
```

Expected health URL: <http://127.0.0.1:8010/health> (liveness only).
The runner only listens on `127.0.0.1`, not on your LAN.

## 2. Spring Boot — `backend/.env`

Add the following values to **the existing** `backend/.env` without deleting
DB/JWT/Cloudinary credentials. The token MUST match the one in `ai-runner/.env`.

```dotenv
AI_RUNNER_URL=http://127.0.0.1:8010
AI_RUNNER_TOKEN=REPLACE_WITH_THE_SAME_LONG_RANDOM_SECRET
```

The existing repository currently contains `application.yaml` with
`spring.config.import: optional:file:./.env[.properties]`. That permits Spring
to load `backend/.env` **when started from `backend/`**. There is also
`application.yml`, so coordinate with the Backend Core owner before consolidating
them. This patch intentionally does **not** modify either shared configuration
file, `pom.xml`, Auth or Project.

```powershell
cd E:\AI-Photo-Editor\backend
.\mvnw.cmd spring-boot:run
```

For machines where Spring's active config does not import `.env`, provide
`AI_RUNNER_URL` and `AI_RUNNER_TOKEN` as OS environment variables, or ask
Backend Core to add `spring.config.import` to the single canonical YAML.
Spring's Java AI client already reads `${AI_RUNNER_URL:...}` and
`${AI_RUNNER_TOKEN:}`; no changes to Java transport code are needed.

### Generate a shared random token (PowerShell)

```powershell
$buffer = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
$token = [Convert]::ToBase64String($buffer)
# Copy $token to BOTH .env files; do not post or commit it.
```

## 3. Connection check

```powershell
# In another terminal, from the ai-runner directory:
cd E:\AI-Photo-Editor\ai-runner
.\.venv\Scripts\python.exe -m pytest -q
```

`GET /health` only proves Python is running. Authenticated
`GET /v1/capabilities` or a real image operation confirms the HTTP contract.
For a full integration pass, also run Java tests, MySQL migrations, Cloudinary
upload and inference with real weights. None are proven by the `.env` fix alone.

## 4. Common errors

| Error | Likely reason | Next action |
| --- | --- | --- |
| Python `ModuleNotFoundError: dotenv` | `python-dotenv` not installed | Re-run `pip install -r requirements-dev.txt` |
| Python `401 RUNNER_UNAUTHORIZED` | Missing/mismatched token | Check same token in both `.env` files and OS env override |
| Java `AI_RUNNER_UNAVAILABLE` | Python not running or URL/port mismatch | Check port and `/health` |
| Python `/health` OK but model fails | Model weights/dependencies unavailable | Follow `weights/WEIGHTS.md` and run real inference |
| Changed `.env` but still old config | Process reads settings at startup | Restart Python and Spring Boot |
