import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from domain import initial_data

DB_PATH=os.getenv('AML_DB_PATH',str(Path(__file__).with_name('aml.db')))

@contextmanager
def state():
    conn=sqlite3.connect(DB_PATH,timeout=30)
    conn.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
    conn.execute('BEGIN IMMEDIATE')
    row=conn.execute('SELECT payload FROM state WHERE id=1').fetchone()
    data=json.loads(row[0]) if row else initial_data()
    try:
        yield data
        conn.execute('INSERT OR REPLACE INTO state VALUES (1,?)',(json.dumps(data,ensure_ascii=False),))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
