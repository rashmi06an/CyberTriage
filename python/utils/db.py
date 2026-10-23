"""Database utilities for CyberTriage."""
import sqlite3
import os


def init_db(db_path: str, schema_path: str | None = None) -> sqlite3.Connection:
    """Initialize the SQLite database with the schema."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True) if os.path.dirname(db_path) else None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    if schema_path is None:
        schema_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', '..', 'database', 'schema.sql'
        )
    if os.path.exists(schema_path):
        with open(schema_path, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
    conn.commit()

    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Lightweight, idempotent migrations for databases created before a column existed."""
    try:
        cols = [row[1] for row in conn.execute("PRAGMA table_info(cases)").fetchall()]
        if 'owner' not in cols:
            conn.execute("ALTER TABLE cases ADD COLUMN owner TEXT DEFAULT ''")
            conn.commit()
    except Exception:
        pass


def row_to_dict(row) -> dict:
    """Convert a sqlite3.Row to a plain dict."""
    if row is None:
        return {}
    return dict(row)


def rows_to_list(rows) -> list:
    """Convert a list of sqlite3.Row to plain dicts."""
    return [dict(r) for r in rows]
