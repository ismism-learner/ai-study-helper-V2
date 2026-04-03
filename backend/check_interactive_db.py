import sqlite3

conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print('Tables in interactive_docs.db:', [t[0] for t in tables])

if 'documents' in [t[0] for t in tables]:
    cursor.execute("PRAGMA table_info(documents)")
    columns = cursor.fetchall()
    print(f"\nDocuments columns: {[c[1] for c in columns]}")

    cursor.execute("SELECT id, title, LENGTH(original_content) as content_len FROM documents")
    docs = cursor.fetchall()
    print(f"\nDocuments count: {len(docs)}")
    for doc in docs:
        print(f"  {doc[0]}: {doc[1]} - content: {doc[2]} chars")

    # Check for 主义主义 folder documents
    cursor.execute("SELECT id, name FROM folders WHERE name = '主义主义'")
    folder = cursor.fetchone()
    if folder:
        print(f"\nFound '主义主义' folder: {folder}")
        cursor.execute("SELECT id, title, LENGTH(original_content) as content_len FROM documents WHERE folder_id = ?", (folder[0],))
        docs = cursor.fetchall()
        print(f"  Documents in this folder: {len(docs)}")
        for d in docs:
            print(f"    - {d[1]} (content: {d[2]} chars)")

conn.close()
