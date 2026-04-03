import sqlite3
import shutil
from datetime import datetime

# Backup current db first
shutil.copy('interactive_docs.db', f'interactive_docs.db.{datetime.now().strftime("%Y%m%d_%H%M%S")}.old')
print("Backed up current interactive_docs.db")

# Copy backup to main db
shutil.copy('interactive_docs.db.backup', 'interactive_docs.db')
print("Restored interactive_docs.db from backup")

# Now add the new columns that were added recently
conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

# Check current columns
cursor.execute("PRAGMA table_info(documents)")
columns = [col[1] for col in cursor.fetchall()]
print(f"\nCurrent columns: {columns}")

# Add new columns if they don't exist
new_columns_added = []
if 'archive_status' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN archive_status TEXT DEFAULT 'unarchived'")
    new_columns_added.append('archive_status')

if 'doc_type' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'text'")
    new_columns_added.append('doc_type')

if 'tags' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN tags TEXT")
    new_columns_added.append('tags')

if 'author' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN author TEXT")
    new_columns_added.append('author')

if 'description' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN description TEXT")
    new_columns_added.append('description')

if 'file_path' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN file_path TEXT")
    new_columns_added.append('file_path')

if 'source_book_id' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN source_book_id TEXT")
    new_columns_added.append('source_book_id')

if 'external_link' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN external_link TEXT")
    new_columns_added.append('external_link')

if 'content_country_id' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN content_country_id INTEGER")
    new_columns_added.append('content_country_id')

if 'content_year_start' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN content_year_start INTEGER")
    new_columns_added.append('content_year_start')

if 'content_year_end' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN content_year_end INTEGER")
    new_columns_added.append('content_year_end')

conn.commit()

if new_columns_added:
    print(f"\nAdded new columns: {new_columns_added}")
else:
    print("\nNo new columns needed")

# Verify documents
cursor.execute("SELECT id, title, LENGTH(original_content) as content_len FROM documents")
docs = cursor.fetchall()
print(f"\nDocuments restored: {len(docs)}")
for doc in docs:
    print(f"  - {doc[1]}: {doc[2]} chars")

conn.close()
print("\n✅ Database restored successfully with all content!")
