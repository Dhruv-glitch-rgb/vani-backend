import sqlite3
import os
import time

DB_PATH = os.path.join(os.path.dirname(__file__), 'vani_memory.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL,
            role TEXT,
            content TEXT
        )
    ''')
    conn.commit()
    conn.close()

def add_message(role, content):
    if not content or content.strip() == "":
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO conversation (timestamp, role, content)
        VALUES (?, ?, ?)
    ''', (time.time(), role, content))
    conn.commit()
    conn.close()

def get_recent_context(limit=10):
    """Fetch the last N messages formatted for OpenRouter context."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Fetch latest limit messages in ascending order
    cursor.execute('''
        SELECT role, content FROM (
            SELECT role, content, id FROM conversation
            ORDER BY id DESC LIMIT ?
        ) ORDER BY id ASC
    ''', (limit,))
    rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for role, content in rows:
        messages.append({"role": role, "content": content})
    return messages

# Initialize DB on load
init_db()
