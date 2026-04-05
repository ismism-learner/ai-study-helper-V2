"""
Migration: Create tasks table for task management
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
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            due_date DATETIME NOT NULL,
            completed INTEGER DEFAULT 0,
            completed_at DATETIME,
            task_type TEXT DEFAULT 'general',
            target_value INTEGER,
            current_value INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'normal',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()
    print("Migration completed successfully! Tasks table created.")

if __name__ == "__main__":
    migrate()
