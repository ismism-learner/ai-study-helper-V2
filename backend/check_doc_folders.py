import sqlite3

conn = sqlite3.connect('interactive_docs.db.backup')
cursor = conn.cursor()

# Get all documents with their folder names
cursor.execute("""
    SELECT d.id, d.title, d.folder_id, f.name as folder_name, LENGTH(d.original_content) as content_len
    FROM documents d
    LEFT JOIN folders f ON d.folder_id = f.id
""")
docs = cursor.fetchall()

print("All documents with folders:")
for doc in docs:
    folder_name = doc[3] if doc[3] else "(no folder)"
    print(f"  {doc[1]}")
    print(f"    - folder: {folder_name}")
    print(f"    - content: {doc[4]} chars")
    print(f"    - folder_id: {doc[2]}")
    print()

# Check folder structure
print("\nFolder structure:")
cursor.execute("SELECT id, name, parent_id FROM folders")
folders = cursor.fetchall()
for f in folders:
    parent = f[2] if f[2] else "(root)"
    print(f"  {f[1]} (id: {f[0][:8]}..., parent: {parent[:8] if parent != '(root)' else parent})")

conn.close()
