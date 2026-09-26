"""SQLite transactions and versioned local documents."""

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]


def storage_dir() -> Path:
    """Allow tests to isolate every persistent file."""
    return Path(os.environ.get("PRODUCT_ADMIN_STORAGE", ROOT / ".local"))


def now() -> str:
    """Return an unambiguous UTC timestamp."""
    return datetime.now(UTC).isoformat()


@contextmanager
def transaction():
    """Serialize writes and roll back all related changes on failure."""
    folder = storage_dir()
    folder.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(folder / "product-admin.sqlite3", timeout=30)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize() -> None:
    """Create storage without importing business reference data."""
    with transaction() as db:
        db.execute("CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY)")
        db.execute("INSERT OR IGNORE INTO schema_version VALUES(1)")
        db.execute("""CREATE TABLE IF NOT EXISTS documents(
            id TEXT PRIMARY KEY, kind TEXT NOT NULL, version INTEGER NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL)""")
        db.execute("CREATE INDEX IF NOT EXISTS document_kind ON documents(kind)")
        db.execute("""CREATE TABLE IF NOT EXISTS history(
            id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, created_at TEXT NOT NULL,
            reason TEXT NOT NULL, changes TEXT NOT NULL)""")
        db.execute("CREATE INDEX IF NOT EXISTS history_entity ON history(entity_id, created_at)")


def unpack(row) -> dict:
    """Decode a persisted document with immutable metadata."""
    return {**json.loads(row["body"]), **{k: row[k] for k in ("id", "version", "created_at", "updated_at")}}


def all_docs(db, kind: str) -> list[dict]:
    """List a resource kind in stable creation order."""
    return [unpack(row) for row in db.execute("SELECT * FROM documents WHERE kind=? ORDER BY created_at", (kind,))]


def get_doc(db, kind: str, identifier: str) -> dict:
    """Require an existing resource of the requested kind."""
    row = db.execute("SELECT * FROM documents WHERE kind=? AND id=?", (kind, identifier)).fetchone()
    if row is None:
        raise HTTPException(404, "대상을 찾을 수 없습니다.")
    return unpack(row)


def save_doc(db, kind: str, body: dict, identifier: str | None = None, version: int | None = None) -> dict:
    """Save with optimistic concurrency protection."""
    timestamp = now()
    clean = {k: v for k, v in body.items() if k not in {"id", "version", "created_at", "updated_at"}}
    if identifier:
        old = get_doc(db, kind, identifier)
        if version != old["version"]:
            raise HTTPException(
                409, {"message": "다른 화면에서 변경되었습니다. 현재 값을 다시 확인하세요.", "current": old}
            )
        db.execute(
            "UPDATE documents SET body=?,version=version+1,updated_at=? WHERE id=?",
            (json.dumps(clean, ensure_ascii=False), timestamp, identifier),
        )
    else:
        identifier = str(uuid4())
        db.execute(
            "INSERT INTO documents VALUES(?,?,?,?,?,?)",
            (identifier, kind, 1, timestamp, timestamp, json.dumps(clean, ensure_ascii=False)),
        )
    return get_doc(db, kind, identifier)


def record_history(db, identifier: str, old: dict, new: dict, fields: list[str], reason: str) -> None:
    """Record only fields whose actual values changed."""
    changes = {k: {"before": old.get(k), "after": new.get(k)} for k in fields if old.get(k) != new.get(k)}
    if changes:
        db.execute(
            "INSERT INTO history VALUES(?,?,?,?,?)",
            (str(uuid4()), identifier, now(), reason, json.dumps(changes, ensure_ascii=False)),
        )
