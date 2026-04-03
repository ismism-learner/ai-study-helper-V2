import sqlite3

conn = sqlite3.connect('app.db')
cursor = conn.cursor()

# Check if columns exist
cursor.execute("PRAGMA table_info(documents)")
columns = [col[1] for col in cursor.fetchall()]
print(f"Existing columns: {columns}")

# Add new columns if they don't exist
if 'content_country_id' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN content_country_id INTEGER")
    print("Added content_country_id")

if 'content_year_start' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN content_year_start INTEGER")
    print("Added content_year_start")

if 'content_year_end' not in columns:
    cursor.execute("ALTER TABLE documents ADD COLUMN content_year_end INTEGER")
    print("Added content_year_end")

conn.commit()

# Check documents content
cursor.execute("SELECT id, title, original_content FROM documents")
docs = cursor.fetchall()
print(f"\nTotal documents: {len(docs)}")
for doc in docs:
    content_len = len(doc[2]) if doc[2] else 0
    print(f"  {doc[0]}: {doc[1]} - content length: {content_len}")

conn.close()
print("\nDatabase fix completed!")
