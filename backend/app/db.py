"""Database: users and runs. SQLite by default, Postgres when DATABASE_URL points to one."""
from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, create_engine, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="profiled")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    message: Mapped[str] = mapped_column(String(255), default="")
    target: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recommended: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile: Mapped[str] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[str] = mapped_column(Text, default="[]")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


_engine = None
_Session: sessionmaker | None = None
JSON_FIELDS = ("profile", "result", "steps")


def normalize_url(url: str) -> str:
    """Hosts often hand out postgres:// URLs. SQLAlchemy needs the driver name."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def configure(url: str) -> None:
    global _engine, _Session
    if _engine is not None:
        _engine.dispose()
    url = normalize_url(url)
    args = {"check_same_thread": False, "timeout": 30} if url.startswith("sqlite") else {}
    _engine = create_engine(url, connect_args=args, pool_pre_ping=True)
    _Session = sessionmaker(_engine, expire_on_commit=False)
    Base.metadata.create_all(_engine)


def is_configured() -> bool:
    return _Session is not None


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    assert _Session is not None, "Database is not configured"
    with _Session() as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    assert _Session is not None, "Database is not configured"
    with _Session() as session:
        yield session


def run_to_dict(run: Run) -> dict:
    return {
        "id": run.id,
        "filename": run.filename,
        "status": run.status,
        "progress": run.progress,
        "message": run.message,
        "target": run.target,
        "recommended": run.recommended,
        "profile": json.loads(run.profile),
        "result": json.loads(run.result) if run.result else None,
        "steps": json.loads(run.steps or "[]"),
        "error": run.error,
        "created_at": run.created_at.isoformat(),
    }


def update_run(run_id: str, **fields) -> None:
    """Small write used while a run is training. Safe to call from a background thread."""
    for key in JSON_FIELDS:
        if key in fields and fields[key] is not None and not isinstance(fields[key], str):
            fields[key] = json.dumps(fields[key], default=str)
    fields["updated_at"] = utcnow()
    with session_scope() as s:
        s.execute(update(Run).where(Run.id == run_id).values(**fields))
        s.commit()


def mark_interrupted() -> int:
    """After a restart no thread is training any more, so a run still marked running has died."""
    with session_scope() as s:
        res = s.execute(
            update(Run).where(Run.status == "running").values(status="error", error="The server restarted while training. Press Train again.")
        )
        s.commit()
        return res.rowcount or 0
