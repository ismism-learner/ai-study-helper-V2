# -*- coding: utf-8 -*-
import os
import sys
import io

# 设置控制台编码
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


def convert_file_encoding(file_path, from_encoding="gbk", to_encoding="utf-8"):
    try:
        with open(file_path, "rb") as f:
            raw_content = f.read()

        try:
            content = raw_content.decode(from_encoding)
        except:
            try:
                content = raw_content.decode("utf-8")
                print(f"File already UTF-8: {os.path.basename(file_path)}")
                return True
            except:
                content = raw_content.decode(from_encoding, errors="ignore")

        with open(file_path, "w", encoding=to_encoding) as f:
            f.write(content)

        print(f"Converted: {os.path.basename(file_path)}")
        return True
    except Exception as e:
        print(f"Failed: {os.path.basename(file_path)} - {e}")
        return False


def main():
    files = [
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotesPanel.tsx",
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotes\index.tsx",
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotes\types.ts",
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotes\usePDFNotes.ts",
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotes\NoteEditor.tsx",
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotes\NotesList.tsx",
        r"C:\Users\haokun\Documents\trae_projects\ai study helper V2\frontend\src\components\PDFNotes\QuickModePanel.tsx",
    ]

    print("=" * 60)
    print("File Encoding Converter")
    print("=" * 60)

    success = 0
    for f in files:
        if os.path.exists(f):
            if convert_file_encoding(f):
                success += 1
        else:
            print(f"Not found: {os.path.basename(f)}")

    print("=" * 60)
    print(f"Done: {success}/{len(files)} files converted")
    print("=" * 60)


if __name__ == "__main__":
    main()
