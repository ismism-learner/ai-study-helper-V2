import sqlite3
import os
import re
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

from app.services.file_parser import FileParser

db_path = r"c:\Users\haokun\Documents\trae_projects\ai study helper V2\backend\interactive_docs.db"
doc_folder = r"c:\Users\haokun\Downloads\主义主义"

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, title FROM documents WHERE original_content LIKE '%无法解析.doc文件内容%'")
failed_docs = cursor.fetchall()
print(f"Found {len(failed_docs)} failed documents in database")

doc_files = {}
for root, dirs, files in os.walk(doc_folder):
    for file in files:
        if file.lower().endswith('.doc') and not file.lower().endswith('.docx'):
            title = os.path.splitext(file)[0]
            full_path = os.path.join(root, file)
            doc_files[title] = full_path

print(f"Found {len(doc_files)} .doc files in folder")

success_count = 0
failed_count = 0
no_match_count = 0

for doc_id, doc_title in failed_docs:
    matching_file = None
    
    if doc_title in doc_files:
        matching_file = doc_files[doc_title]
    else:
        for file_title, file_path in doc_files.items():
            if doc_title == file_title or doc_title in file_title or file_title in doc_title:
                matching_file = file_path
                break
    
    if not matching_file:
        no_match_count += 1
        continue
    
    print(f"\nProcessing: {doc_title}")
    print(f"  File: {os.path.basename(matching_file)}")
    
    try:
        new_content = FileParser.parse_file(matching_file, '.doc')
        
        if new_content and not new_content.startswith("[无法解析"):
            cursor.execute(
                "UPDATE documents SET original_content = ? WHERE id = ?",
                (new_content, doc_id)
            )
            conn.commit()
            print(f"  [SUCCESS] Content length: {len(new_content)}")
            success_count += 1
        else:
            print(f"  [FAILED] Still cannot parse")
            failed_count += 1
            
    except Exception as e:
        print(f"  [ERROR] {str(e)}")
        failed_count += 1

conn.close()

print(f"\n=== Refresh Complete ===")
print(f"Success: {success_count}")
print(f"Failed: {failed_count}")
print(f"No match: {no_match_count}")
