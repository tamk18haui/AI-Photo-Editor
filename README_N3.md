# AI Photo Editor — N3 Lumina v3 (09/10/2026), based on FULL DB v2

## Included

- `backend/`: N3 code package — Auth JWT, User, Project, EditorState; JPA/Flyway V1/V2; Spring `application.yml`, `.env.example`.
- `docs/contracts/07_...yaml` and `08_...yaml`: original API contract and integration constraints, **unchanged**.
- `database/CREATE_DATABASE_DEV.sql`: database creation helper for MySQL 8.
- `database/REVIEW_ONLY_full_27_tables/V1...V12`: proposed 27-table FULL schema, for review only. DO NOT copy V3-V12 into runtime migrations automatically.
- `Install-N3.ps1`: preview first, apply after conflicts reviewed. No Git push is performed.
- `Smoke-N3.ps1`: API smoke check after running Spring.
- `INTEGRATION_N1_LUMINA.md`: N1 API integration handoff based on the available LoginPage and newest Git commit metadata (without changing N1 frontend).

## Why this is v3

Builds on the previous N3 DB FULL v2 package and includes a dedicated N1 Lumina API handoff in `INTEGRATION_N1_LUMINA.md`, a serialization contract test, and EditorState canvas-size validation. Reconciles core migrations and JPA fields with `AI_Photo_Editor_CSDL_FULL_v2.docx` data dictionary: `oauth_accounts.provider_email`, `editor_states.schema_version`, `editor_states.created_at`, `editor_states.updated_at`. `projects.version` and `editor_states.lock_version` are deliberate JPA concurrency columns. N3 `SaveStateResponse.savedAt` is backed by `editor_states.updated_at`. The initial POST project creates stateVersion=1; the first PUT increments to 2.

## Caution before running any code

The **latest known** N1 Git branch is `f6d4ec6`, but private repository contents were not readable from this environment. N1 frontend source was not included in this ZIP. Do not paste any backend folder over the whole repository or modify N1 files.

**Private GitHub repository was not inspectable through the connected account.** This is a standalone N3 implementation based on the provided contract, not a diff against your current backend folder. The installation script refuses to overwrite existing changed files unless explicitly told. In particular review `backend/pom.xml`, `application.yml`, and Flyway V1/V2 before applying.

**If your DB already has V1/V2 applied**, DO NOT overwrite migration files: checksum mismatches will prevent startup. Use a NEW migration after reviewing the current schema; don't use `repair` to conceal a real change. For a new LOCAL EMPTY DB, V1/V2 can run automatically.

## Installation with IntelliJ / Windows

1. Extract ZIP to e.g. `E:\N3-Lumina-v3-pack`.
2. Make sure `git branch --show-current` is `feature/n3-backend-core`.
3. In extracted folder, PowerShell:

```powershell
.\Install-N3.ps1 -RepoRoot 'E:\AI-Photo-Editor'
# Review conflicts and compare pom.xml, app yml, migrations
.\Install-N3.ps1 -RepoRoot 'E:\AI-Photo-Editor' -Apply
```

4. When existing files conflict, **merge manually**. Only use `-ReplaceExisting` after comparing against current code; it backs up existing files to a sibling folder outside repo.
5. MySQL 8 create database with `database/CREATE_DATABASE_DEV.sql`, configure `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SIGNING_SECRET` as environment variables in IntelliJ Run Configuration. Secret at least 32 UTF-8 bytes.
6. From `E:\AI-Photo-Editor\backend` run:

```powershell
mvn clean test
mvn spring-boot:run
```

7. Test Auth/Project/Editor State in Postman then `git status`, commit on your N3 branch and push. Create a PR for Tâm; do not touch `main` directly.

## Boundary with N4/N5

- N4 alone implements Cloudinary Asset API, asset database mapping and cleanup, and reviews V3 and V7.
- N5 implements Gemini, job HTTP routes, SSE, natural editing; N4/N5 review V4, V8–V12.
- Project deletion that contains Cloudinary assets needs N4 coordination (DB transaction cannot roll back Cloudinary delete).
- Avatar and thumbnail lookup needs N4's owned asset resolver; N3 currently fails safely when no bridge exists.
- Google ID login exists behind a disabled feature flag. Its route is a proposal and must be approved in YAML before N1 integrates it.

## What is verified / NOT verified

- Static OpenAPI YAML checks, SQL parsing/table count, zip integrity and Java source references can be checked offline.
- NOT yet built with Maven or run against your real IntelliJ repo/MySQL; please do not treat as production-ready until those pass.

## Work split preserved

N3 only: Auth/User/Projects/EditorState + common Security/JPA/Flyway V1/V2. N4: Asset/Cloudinary + AI local. N5: Gemini/Orchestration/AI HTTP. `database/REVIEW_ONLY_full_27_tables` is a design reference only.

## Quick path

```powershell
git -C E:\AI-Photo-Editor branch --show-current
# in the unpacked N3 ZIP folder
.\Install-N3.ps1 -RepoRoot 'E:\AI-Photo-Editor'
# if conflicts=0
.\Install-N3.ps1 -RepoRoot 'E:\AI-Photo-Editor' -Apply
cd E:\AI-Photo-Editor\backend
mvn clean test
```

Never merge to main directly; push only feature/n3-backend-core, then PR for Tâm review.
