import requests
import json
import time
import sys

BASE_URL = "http://localhost:8000"

def test_health():
    print("测试健康检查...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print("✓ 服务运行正常")
            return True
        else:
            print(f"✗ 服务异常: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ 无法连接服务: {e}")
        return False

def test_paddleocr_status():
    print("\n测试 PaddleOCR 状态...")
    try:
        response = requests.get(f"{BASE_URL}/api/pdf-ocr/paddle/status")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ PaddleOCR 状态:")
            print(f"  模型已加载: {data.get('model_loaded')}")
            print(f"  GPU 可用: {data.get('gpu_available')}")
            print(f"  设备: {data.get('device')}")
            return True
        else:
            print(f"✗ 获取状态失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ 请求失败: {e}")
        return False

def test_smart_ocr(file_path):
    print(f"\n测试智能 OCR 处理: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"✗ 文件不存在: {file_path}")
        return False
    
    try:
        payload = {
            "file_path": file_path
        }
        
        print("正在处理...")
        start_time = time.time()
        
        response = requests.post(
            f"{BASE_URL}/api/pdf-ocr/paddle/smart-process",
            json=payload,
            timeout=300
        )
        
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ 处理成功 (耗时: {elapsed:.2f}秒)")
            print(f"  输出文件: {data.get('output_path')}")
            print(f"  已有 OCR: {data.get('had_ocr')}")
            print(f"  处理页数: {data.get('pages_processed')}")
            print(f"  消息: {data.get('message')}")
            
            if data.get('text_content'):
                print(f"\n提取的文字 (前 200 字符):")
                print(data.get('text_content')[:200])
            
            return True
        else:
            print(f"✗ 处理失败: {response.status_code}")
            print(f"  错误: {response.text}")
            return False
            
    except requests.Timeout:
        print("✗ 请求超时，请尝试使用异步接口")
        return False
    except Exception as e:
        print(f"✗ 请求失败: {e}")
        return False

def test_async_ocr(file_path):
    print(f"\n测试异步 OCR 处理: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"✗ 文件不存在: {file_path}")
        return False
    
    try:
        encoded_path = requests.utils.quote(file_path, safe='')
        
        print("启动异步处理...")
        response = requests.post(
            f"{BASE_URL}/api/pdf-ocr/paddle/smart-process-async/{encoded_path}"
        )
        
        if response.status_code != 200:
            print(f"✗ 启动失败: {response.status_code}")
            return False
        
        print("✓ 异步处理已启动")
        
        max_wait = 60
        waited = 0
        
        while waited < max_wait:
            time.sleep(2)
            waited += 2
            
            status_response = requests.get(
                f"{BASE_URL}/api/pdf-ocr/paddle/smart-status/{encoded_path}"
            )
            
            if status_response.status_code == 200:
                status_data = status_response.json()
                status = status_data.get('status')
                
                print(f"  状态: {status} (已等待 {waited}秒)")
                
                if status == 'completed':
                    print("✓ 处理完成")
                    result = status_data.get('result', {})
                    print(f"  输出文件: {result.get('output_path')}")
                    print(f"  处理页数: {result.get('pages_processed')}")
                    return True
                elif status == 'failed':
                    print(f"✗ 处理失败: {status_data.get('error')}")
                    return False
        
        print("✗ 处理超时")
        return False
        
    except Exception as e:
        print(f"✗ 请求失败: {e}")
        return False

def main():
    import os
    
    print("=" * 60)
    print("PaddleOCR API 使用示例")
    print("=" * 60)
    
    if not test_health():
        print("\n请先启动服务: 运行 一键启动.bat")
        return
    
    test_paddleocr_status()
    
    test_files = ["test.pdf", "test_two_pages.pdf"]
    test_file = None
    
    for file in test_files:
        if os.path.exists(file):
            test_file = file
            break
    
    if test_file:
        print(f"\n找到测试文件: {test_file}")
        
        print("\n选择测试方式:")
        print("1. 同步处理 (适合小文件)")
        print("2. 异步处理 (适合大文件)")
        print("3. 跳过")
        
        choice = input("\n请选择 (1/2/3): ").strip()
        
        if choice == "1":
            test_smart_ocr(test_file)
        elif choice == "2":
            test_async_ocr(test_file)
        else:
            print("跳过文件处理测试")
    else:
        print("\n未找到测试文件，跳过文件处理测试")
        print("您可以手动测试:")
        print(f"  curl -X POST {BASE_URL}/api/pdf-ocr/paddle/smart-process")
        print(f'  -H "Content-Type: application/json"')
        print(f'  -d \'{{"file_path": "your_file.pdf"}}\'')
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
    print("\nAPI 文档: http://localhost:8000/docs")
    print("健康检查: http://localhost:8000/health")

if __name__ == "__main__":
    main()
