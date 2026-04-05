"""
Migration: Create activity_logs table
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'interactive_docs.db')

def migrate():
    print(f"Database path: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print(f"Database file not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            details TEXT,
            book_id TEXT,
            document_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES book_documents(id),
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    """)
    
    conn.commit()
    conn.close()
    print("Migration completed successfully! Activity logs table created.")

if __name__ == "__main__":
    migrate()
