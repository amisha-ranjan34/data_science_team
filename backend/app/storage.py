"""Local or S3-compatible storage for downloadable run artifacts."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Iterator


ARTIFACT_NAMES = {"model.joblib", "train_model.py", "report.md"}


def _mode() -> str:
    mode = os.getenv("ARTIFACT_STORAGE", "local").strip().lower()
    if mode not in {"local", "s3"}:
        raise RuntimeError("ARTIFACT_STORAGE must be 'local' or 's3'.")
    if mode == "s3" and not os.getenv("ARTIFACT_BUCKET"):
        raise RuntimeError("ARTIFACT_BUCKET must be set when ARTIFACT_STORAGE=s3.")
    return mode


def _s3_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
        region_name=os.getenv("AWS_REGION") or None,
    )


def _key(run_id: str, filename: str) -> str:
    if filename not in ARTIFACT_NAMES:
        raise ValueError("Unknown artifact name.")
    return f"runs/{run_id}/artifacts/{filename}"


def store_artifacts(run_id: str, artifact_dir: Path) -> None:
    if _mode() == "local":
        return
    client = _s3_client()
    bucket = os.environ["ARTIFACT_BUCKET"]
    for path in artifact_dir.iterdir():
        if path.is_file() and path.name in ARTIFACT_NAMES:
            client.upload_file(str(path), bucket, _key(run_id, path.name))


def get_artifact(run_id: str, filename: str, local_path: Path | None = None) -> Path | Iterator[bytes] | None:
    key = _key(run_id, filename)
    if _mode() == "local":
        path = local_path or (
            Path(os.getenv("DATA_DIR") or Path(__file__).resolve().parent.parent / "data")
            / "runs"
            / run_id
            / "artifacts"
            / filename
        )
        return path if path.is_file() else None
    from botocore.exceptions import ClientError

    try:
        return stream_body(_s3_client().get_object(Bucket=os.environ["ARTIFACT_BUCKET"], Key=key)["Body"])
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def stream_body(body: Any) -> Iterator[bytes]:
    try:
        yield from body.iter_chunks(chunk_size=64 * 1024)
    finally:
        body.close()


def delete_artifacts(run_id: str) -> None:
    if _mode() == "local":
        return
    client = _s3_client()
    bucket = os.environ["ARTIFACT_BUCKET"]
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=f"runs/{run_id}/artifacts/"):
        keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
        if keys:
            client.delete_objects(Bucket=bucket, Delete={"Objects": keys})
