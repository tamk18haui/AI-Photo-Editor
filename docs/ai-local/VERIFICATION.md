# Verification results and limitations

This report deliberately distinguishes **test run** from **not verified**.

## Tested in packaging environment

- Python 3.13.5 + installed FastAPI/OpenCV/Pillow/NumPy: **29/29 automated tests passed** (unit tests, HTTP multipart image requests, missing weight errors, ONNX adapter with fake in-memory session). All processing results from CPU algorithms come from real OpenCV/Pillow code; tests do not fake completed model inference.
- Static Java ↔ Python operation comparison: **16/16 exact operation slug matches**.
- `V5__ai_jobs_progress_integer.sql` legacy checksum check: PASS.
- No React source, N3 Auth/Project/EditorState or N5 shared Job API/SSE overwritten in package: PASS static inspection.

## Not yet verified

- Java Maven `clean test` **has not run against a fully cloned GitHub repository** in this environment; Maven dependencies/repository DB are unavailable here.
- No real MySQL, Flyway migration, JWT, Cloudinary user credentials available: cannot claim project→asset→AI→Cloudinary end-to-end PASS.
- No user-provided checkpoint binaries bundled: actual inference for Real-ESRGAN, BiRefNet, SAM, LaMa, GFPGAN, MediaPipe Face Landmarker and ResNet34 ONNX **has not been executed here**.
- Big-LaMa original `saicinpainting` dependency set may require a separate environment; cannot claim it works on all Windows/Python combinations.

## Next acceptance tests on user's PC / GPU server

1. Clone current repo into clean feature branch, installer dry-run and apply.
2. Start MySQL with approved migrations; run Java 21 Maven tests and Spring Boot.
3. Run Python tests; install matching weights from WEIGHTS.md and run every model on real images.
4. Test 401, 404, wrong project, corrupt image, oversized image, incorrect mask and cancel during active job.
5. Test Cloudinary signed upload/download and `resultAssetId` with correct project provenance.
6. Test the API payload from N1/N2 with `/api/ai/*`; synchronize additional `/api/ai/local/*` routes into contract by team review.

**Do not label a checkpoint `VERIFIED` until inference and image output have been inspected on its actual runtime.**
