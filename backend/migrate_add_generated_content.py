import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'interactive_docs.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("PRAGMA table_info(documents)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'generated_content' not in columns:
            print("Adding generated_content column to documents table...")
            cursor.execute("ALTER TABLE documents ADD COLUMN generated_content TEXT")
            conn.commit()
            print("Migration completed successfully!")
        else:
            print("Column generated_content already exists, skipping migration.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
