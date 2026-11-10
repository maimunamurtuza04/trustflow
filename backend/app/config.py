from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TrustFlow"
    environment: str = "development"
    database_url: str = f"sqlite:///{(BASE_DIR / 'trustflow.db').as_posix()}"
    jwt_secret: str = "dev-only-change-me-trustflow-prototype-key"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 12 * 60
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Payments. "simulated" is the only mode exercised by tests and demos.
    # "paypal" requires credentials and is never selected implicitly.
    payments_provider: str = "simulated"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_mode: str = "sandbox"
    paypal_webhook_id: str = ""

    # AI is advisory only. Without a key every AI service reports that it is unavailable
    # rather than returning fabricated output.
    ai_api_key: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 20.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def ai_enabled(self) -> bool:
        return bool(self.ai_api_key.strip())

    @property
    def paypal_configured(self) -> bool:
        return bool(self.paypal_client_id.strip() and self.paypal_client_secret.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
