from functools import lru_cache
from typing import Optional

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    whisper_model_size: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_beam_size: int = 5
    vad_filter: bool = True
    
    max_audio_seconds: int = 40*60
    max_upload_mb: int = 40
    
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "us.amazon.nova-micro-v1:0"
    region_name: str = Field("us-east-1", validation_alias=AliasChoices("region_name", "AWS_DEFAULT_REGION"))
    embed_model: str = "nomic-embed-text"
    num_ctx: int = 16384
    temperature: float = 0.2
    
    enable_rag: bool = True
    chunk_target_chars: int = 1200
    chunk_overlap_chars: int = 150
    retriever_top_k: int = 4

    max_history_turns: int = 6          # most recent chat messages sent to the LLM
    max_history_chars_per_turn: int = 2000
    
    upload_dir: str = "./tmp/uploads"
    
    chroma_dir: str = "./tmp/chroma"
    db_path: str = "./tmp/jobs.db"

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    
    # Optional: when unset, boto3's default credential chain is used (env, ~/.aws, IAM role).
    aws_access_key_id: Optional[SecretStr] = None
    aws_secret_access_key: Optional[SecretStr] = None
    aws_session_token: Optional[SecretStr] = None
    
@lru_cache
def get_settings() -> Settings:
    return Settings()