from functools import lru_cache
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PKonek API"
    api_prefix: str = "/api"
    database_url: str = ""
    mysql_host: Optional[str] = None
    mysql_port: int = 3306
    mysql_user: Optional[str] = None
    mysql_password: Optional[str] = None
    mysql_database: str = "defaultdb"
    mysql_ssl_ca: Optional[str] = None
    jwt_secret: str = Field(default="", min_length=1)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 1440
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    bootstrap_admin_email: Optional[str] = None
    bootstrap_admin_password: Optional[str] = None

    lumen_api_base: Optional[str] = None
    lumen_api_key: Optional[str] = None
    lumen_api_secret: Optional[str] = None
    lumen_instance_id: Optional[str] = None
    # Retained for compatibility with older .env files; Lumen Suite uses an instance ID, not a model name.
    lumen_model: Optional[str] = None

    enable_clip: bool = False
    clip_model: str = "openai/clip-vit-base-patch32"
    enable_ocr: bool = False
    tesseract_cmd: Optional[str] = None

    scheduler_enabled: bool = True
    sla_warning_hours: int = 4
    auto_close_hours: int = 72

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_runtime(self):
        # Separate fields avoid URL-encoding mistakes when an Aiven password contains @, :, /, or #.
        if not self.database_url and self.mysql_host and self.mysql_user and self.mysql_password:
            user = quote(self.mysql_user, safe="")
            password = quote(self.mysql_password, safe="")
            database = quote(self.mysql_database, safe="")
            self.database_url = (
                f"mysql+pymysql://{user}:{password}@{self.mysql_host}:{self.mysql_port}/{database}"
            )
        if not self.database_url:
            raise ValueError(
                "Configure DATABASE_URL or MYSQL_HOST, MYSQL_USER, and MYSQL_PASSWORD for Aiven"
            )
        if self.database_url.startswith("mysql+pymysql"):
            if not self.mysql_ssl_ca:
                raise ValueError("MYSQL_SSL_CA is required for Aiven MySQL TLS")
            if not Path(self.mysql_ssl_ca).is_file():
                raise ValueError("MYSQL_SSL_CA must point to an existing CA certificate")
        elif not self.database_url.startswith("sqlite"):
            raise ValueError("DATABASE_URL must use mysql+pymysql for Aiven; SQLite is allowed only when explicitly configured")
        if not self.jwt_secret or len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 characters")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
