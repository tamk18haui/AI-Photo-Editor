"""Structural contract audit that runs without Spring/Maven or model checkpoints."""
from pathlib import Path
import re
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
JAVA = ROOT / "backend" / "src" / "main" / "java" / "com" / "aiphotoeditor"
PYTHON = ROOT / "ai-runner"

def run() -> None:
    """Compare operation slugs, legacy migrations and module ownership."""
    enum_source = (JAVA / "job" / "AiJobType.java").read_text(encoding="utf-8")
    java_ops = set(re.findall(r"[A-Z_]+\(\"([^\"]+)\"\)", enum_source))
    sys.path.insert(0, str(PYTHON))
    from processors.dispatch import OPERATIONS
    assert java_ops == OPERATIONS, f"Java/Python operation mismatch {java_ops ^ OPERATIONS}"
    assert not (ROOT / "frontend").exists(), "This module must not overwrite frontend"
    assert not (JAVA / "job" / "AiJobController.java").exists(), "N5 owns public Job Controller"
    assert not (JAVA / "job" / "AiJobEventService.java").exists(), "N5 owns SSE"
    filename = ROOT / "backend/src/main/resources/db/migration/V5__ai_jobs_progress_integer.sql"
    crc = 0
    for line in filename.read_text(encoding="utf-8").splitlines():
        crc = zlib.crc32(line.encode("utf-8"), crc)
    assert crc == 770923544, f"Legacy Flyway V5 checksum changed: {crc}"
    assert (JAVA / "asset" / "OwnedAssetReferenceResolver.java").exists()
    assert (JAVA / "ai" / "LocalImageService.java").exists()
    print(f"PASS: {len(java_ops)} Java/Python operations; no FE/N5 collisions; legacy V5 checksum preserved")

if __name__ == "__main__": run()
