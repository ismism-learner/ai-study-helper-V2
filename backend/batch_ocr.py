"""
batch_ocr.py — 批量OCR扫描件PDF，结果保存到文本文件
支持断点续传：已OCR的页码会跳过

用法（从WSL调用）：
  python.exe batch_ocr.py <pdf_path> <output_path> [start_page] [batch_size]

示例：
  python.exe batch_ocr.py "C:\\path\\to\\book.pdf" "C:\\path\\to\\book_ocr.txt" 0 50
"""

import json
import os
import sys
import tempfile
import time

import fitz


def get_already_ocrd_pages(output_path):
    """读取已有OCR结果，返回已完成的页码集合"""
    done = set()
    if not os.path.exists(output_path):
        return done
    try:
        with open(output_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("<!-- PAGE "):
                    try:
                        page_num = int(line.split()[2].rstrip(" -->"))
                        done.add(page_num)
                    except (IndexError, ValueError):
                        pass
    except Exception:
        pass
    return done


def batch_ocr(pdf_path, output_path, start_page=0, batch_size=50):
    """批量OCR PDF，结果追加到output_path"""
    import paddle
    paddle.device.set_device("gpu:0")
    from paddleocr import PaddleOCR

    ocr = PaddleOCR(use_angle_cls=True, lang="ch", use_gpu=True, show_log=False)

    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    already_done = get_already_ocrd_pages(output_path)
    print(f"PDF总页数: {total_pages}, 已OCR: {len(already_done)}页", flush=True)

    end_page = min(start_page + batch_size, total_pages)
    pages_to_ocr = [i for i in range(start_page, end_page) if i not in already_done]

    if not pages_to_ocr:
        print(f"第{start_page+1}-{end_page}页已全部OCR完成，跳过", flush=True)
        return

    print(f"本次OCR: 第{pages_to_ocr[0]+1}-{pages_to_ocr[-1]+1}页 ({len(pages_to_ocr)}页)", flush=True)

    # 追加模式写入
    mode = "a" if os.path.exists(output_path) else "w"
    with open(output_path, mode, encoding="utf-8") as f:
        for page_idx in pages_to_ocr:
            page = doc[page_idx]
            mat = fitz.Matrix(1.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            tmp_path = os.path.join(
                tempfile.gettempdir(), f"batch_ocr_{page_idx}.png"
            )
            pix.save(tmp_path)

            start_time = time.time()
            result = ocr.ocr(tmp_path, cls=True)
            elapsed = time.time() - start_time

            # 提取文字
            text_lines = []
            if result and result[0]:
                for line in result[0]:
                    if line and len(line) >= 2:
                        text_info = line[1]
                        if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                            text_lines.append(text_info[0])

            page_text = "\n".join(text_lines)

            # 写入：页码标记 + 文字
            f.write(f"<!-- PAGE {page_idx} -->\n")
            f.write(page_text)
            f.write("\n\n")
            f.flush()

            os.unlink(tmp_path)

            print(
                f"  第{page_idx+1}页: {elapsed:.1f}秒, {len(page_text)}字符",
                flush=True,
            )

    doc.close()
    print(f"完成! 结果保存到: {output_path}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: batch_ocr.py <pdf_path> <output_path> [start_page] [batch_size]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    start_page = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    batch_size = int(sys.argv[4]) if len(sys.argv) > 4 else 50

    batch_ocr(pdf_path, output_path, start_page, batch_size)
