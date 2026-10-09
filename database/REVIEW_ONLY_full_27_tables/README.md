# FULL database blueprint v2 — REVIEW ONLY

12 Flyway-style SQL files represent the **27-table proposal** from the existing `AI_Photo_Editor_CSDL_FULL_v2.docx`.

- Only V1 and V2 are copied into `backend/src/main/resources/db/migration` (N3 core).
- V3–V12 remain here deliberately. They are **not auto-applied** on Spring Boot startup.
- V3/V4/V7/V9 are N4/N5 territory; V5 spans N3/N4, V10 spans N1/N2/N5. Approvals/review are required.
- These SQL files are **implementation drafts reconstructed from the database design document**, NOT a verified export of an existing MySQL schema.
- Review constraints, delete/cascade behavior and entity mappings with all owners before moving any draft into Flyway.
- Never modify a migration that Flyway has already applied. If V1/V2 already ran, create a new Vn patch after checking `flyway_schema_history`.

The core migrations also contain additive `version` / `lock_version` concurrency columns required by the supplied N3 JPA entities.
