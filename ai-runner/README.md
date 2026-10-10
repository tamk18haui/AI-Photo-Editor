# Python Image AI Runner

This private HTTP service runs **only** on `127.0.0.1:8010`. Spring Boot controls authentication and project ownership; Python requires a shared `AI_RUNNER_TOKEN` header to reject other callers.

- Read [weights/WEIGHTS.md](weights/WEIGHTS.md) for the complete 7-model layout and dependency caveats.
- Install `requirements-dev.txt` and run `python -m pytest -q` for CPU/API tests.
- Install `requirements-models.txt` in a compatible Python/PyTorch environment to enable neural models; Big-LaMa uses the `weights/lama/big-lama.pt` TorchScript artifact and does not need `saicinpainting`.
- Copy `.env.example` to `.env`, set `AI_RUNNER_TOKEN`, and start with `python run.py`. The `.env` file is loaded automatically (OS env values take precedence). Do not expose the port publicly.
- `GET /health` checks service liveness only; `GET /v1/capabilities` (authenticated) shows operations and checkpoint file presence, not proof of model inference.
- `POST /v1/run/{operation}` takes multipart `file`, JSON string `params`, optional `mask`, optional `background`. It returns actual PNG bytes or typed errors.
- `POST /v1/analyze-quality` and `POST /v1/face-landmarks` return JSON.

The release uses **SAM ViT-B** for interactive selection. MagicTouch is not a default processor. No diffusion/outpainting models are shipped in this seven-model configuration.

See [../docs/ai-local/ENV_CONFIGURATION.md](../docs/ai-local/ENV_CONFIGURATION.md) for the matching Spring Boot token and troubleshooting.
