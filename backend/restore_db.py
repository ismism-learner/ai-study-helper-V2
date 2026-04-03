import sqlite3
import json
from datetime import datetime

# Load backup data
with open('data_backup.json', 'r', encoding='utf-8') as f:
    backup = json.load(f)

conn = sqlite3.connect('app.db')
cursor = conn.cursor()

print("Creating tables...")

# Create folders table
cursor.execute('''
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES folders (id)
)
''')

# Create documents table with all columns
cursor.execute('''
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_content TEXT,
    framework_content TEXT,
    processed_content TEXT,
    folder_id TEXT,
    archive_status TEXT DEFAULT 'unarchived',
    doc_type TEXT DEFAULT 'text',
    tags TEXT,
    author TEXT,
    description TEXT,
    file_path TEXT,
    source_book_id TEXT,
    external_link TEXT,
    content_country_id INTEGER,
    content_year_start INTEGER,
    content_year_end INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES folders (id)
)
''')

# Create other necessary tables
cursor.execute('''
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_image TEXT,
    file_path TEXT,
    file_type TEXT,
    archive_status TEXT DEFAULT 'unarchived',
    folder_id TEXT,
    tags TEXT,
    country_id INTEGER,
    year_start INTEGER,
    year_end INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS world_timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT,
    book_id TEXT,
    event_title TEXT NOT NULL,
    event_description TEXT,
    event_date TEXT,
    year INTEGER,
    month INTEGER,
    day INTEGER,
    location TEXT,
    page_number INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents (id),
    FOREIGN KEY (book_id) REFERENCES books (id)
)
''')

conn.commit()

# Restore folders
print(f"\nRestoring {len(backup.get('folders', []))} folders...")
for folder in backup.get('folders', []):
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO folders (id, name, parent_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (folder[0], folder[1], folder[2], folder[3], folder[4]))
    except Exception as e:
        print(f"  Error restoring folder {folder}: {e}")

# Restore documents - but we need content from another source
# For now, just create the structure
print(f"\nRestoring {len(backup.get('documents', []))} documents...")
for doc in backup.get('documents', []):
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO documents (id, title, folder_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (doc[0], doc[1], doc[2], doc[3], doc[4]))
    except Exception as e:
        print(f"  Error restoring document {doc}: {e}")

conn.commit()

# Check what we have
print("\n--- Verification ---")
cursor.execute("SELECT COUNT(*) FROM folders")
print(f"Folders: {cursor.fetchone()[0]}")

cursor.execute("SELECT COUNT(*) FROM documents")
print(f"Documents: {cursor.fetchone()[0]}")

cursor.execute("SELECT id, name FROM folders WHERE name = '主义主义'")
folder = cursor.fetchone()
if folder:
    print(f"\nFound '主义主义' folder: {folder}")
    cursor.execute("SELECT id, title FROM documents WHERE folder_id = ?", (folder[0],))
    docs = cursor.fetchall()
    print(f"  Documents in this folder: {len(docs)}")
    for d in docs:
        print(f"    - {d[1]}")

conn.close()
print("\nDatabase restore completed!")
