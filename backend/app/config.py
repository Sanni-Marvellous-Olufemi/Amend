import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """Minimal .env support; real environment variables take precedence."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("AMEND_HOST", "127.0.0.1")
    port: int = int(os.getenv("AMEND_PORT", "47615"))
    ollama_url: str = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen3-vl:4b-instruct")
    # Empty means "accept any chrome-extension:// origin" (local development only).
    extension_id: str = os.getenv("AMEND_EXTENSION_ID", "").strip()
    mock: bool = _bool("AMEND_MOCK")
    timeout_s: float = float(os.getenv("AMEND_TIMEOUT_S", "90"))
    max_body_bytes: int = int(os.getenv("AMEND_MAX_BODY_BYTES", str(12 * 1024 * 1024)))
    default_duration_min: int = int(os.getenv("AMEND_DEFAULT_DURATION_MIN", "60"))


settings = Settings()
