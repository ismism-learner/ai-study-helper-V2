"""
ocr_bridge.py — WSL2环境下通过Windows侧Python调用AI Study Helper V2的OCR API
解决WSL2网络隔离问题：WSL无法通过localhost访问Windows的8000端口

用法（从WSL调用）：
  python.exe ocr_bridge.py check <windows_pdf_path>
  python.exe ocr_bridge.py pdf <windows_pdf_path>
  python.exe ocr_bridge.py image <windows_image_path>
  python.exe ocr_bridge.py status
"""

import json
import os
import sys
import urllib.request

API_BASE = "http://localhost:8000/api/pdf-ocr"
TIMEOUT = 600


def call_api(method, endpoint, body=None):
    """调用API并返回JSON结果"""
    url = f"{API_BASE}{endpoint}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        r = urllib.request.urlopen(req, timeout=TIMEOUT)
        return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"success": False, "error": f"HTTP {e.code}: {e.read().decode()}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def cmd_status():
    """检查PaddleOCR模型状态"""
    result = call_api("GET", "/paddle/status")
    print(json.dumps(result, ensure_ascii=False))


def cmd_check(file_path):
    """检查PDF是否有文字层"""
    result = call_api("GET", f"/status/{file_path}")
    print(json.dumps(result, ensure_ascii=False))


def cmd_pdf(file_path):
    """智能提取PDF文字（自动判断是否需要OCR）"""
    # 先检查是否有文字层
    check = call_api("GET", f"/status/{file_path}")
    has_text = check.get("has_text_layer", False)

    if has_text:
        # 有文字层，用smart-process直接提取
        result = call_api("POST", "/paddle/smart-process", {"file_path": file_path})
    else:
        # 无文字层，需要OCR
        # 先确保模型已加载
        status = call_api("GET", "/paddle/status")
        if not status.get("model_loaded"):
            call_api("POST", "/paddle/load-model")
            import time
            for _ in range(12):
                time.sleep(5)
                s = call_api("GET", "/paddle/status")
                if s.get("model_loaded"):
                    break

        result = call_api("POST", "/paddle/smart-process", {"file_path": file_path})

    print(json.dumps(result, ensure_ascii=False))


def cmd_image(file_path):
    """OCR识别图片"""
    result = call_api("POST", f"/paddle/process-image/{file_path}")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: ocr_bridge.py <status|check|pdf|image> [file_path]")
        sys.exit(1)

    command = sys.argv[1]

    if command == "status":
        cmd_status()
    elif command in ("check", "pdf", "image"):
        if len(sys.argv) < 3:
            print(f"用法: ocr_bridge.py {command} <file_path>")
            sys.exit(1)
        file_path = sys.argv[2]
        if command == "check":
            cmd_check(file_path)
        elif command == "pdf":
            cmd_pdf(file_path)
        elif command == "image":
            cmd_image(file_path)
    else:
        print(f"未知命令: {command}")
        sys.exit(1)
