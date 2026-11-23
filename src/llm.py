from langchain_aws import ChatBedrockConverse

from .config import Settings


def bedrock_llm(settings: Settings) -> ChatBedrockConverse:
    # pydantic-settings reads .env into Settings but does NOT export it to os.environ,
    # so boto3 would never see keys that live only in .env. Pass them explicitly; when
    # unset, boto3 falls back to its default chain (env vars, ~/.aws, IAM role).
    return ChatBedrockConverse(
        model=settings.llm_model,
        region_name=settings.region_name,
        temperature=settings.temperature,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_session_token=settings.aws_session_token,
    )
