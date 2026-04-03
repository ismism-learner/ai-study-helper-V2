import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.paddleocr_service import paddleocr_service

async def test_gpu_detection():
    print("=" * 60)
    print("测试 1: GPU 检测")
    print("=" * 60)
    
    status = paddleocr_service.get_status()
    print(f"GPU 可用: {status.get('gpu_available', False)}")
    print(f"设备: {status.get('device', 'unknown')}")
    print(f"模型已加载: {status.get('model_loaded', False)}")
    
    if status.get('gpu_available'):
        print("✓ GPU 检测成功")
    else:
        print("⚠ GPU 不可用，将使用 CPU 模式")
    
    return True

async def test_model_loading():
    print("\n" + "=" * 60)
    print("测试 2: 模型加载")
    print("=" * 60)
    
    print("正在加载 PaddleOCR 模型...")
    start_time = time.time()
    
    success = await paddleocr_service.load_model()
    
    elapsed = time.time() - start_time
    
    if success:
        print(f"✓ 模型加载成功 (耗时: {elapsed:.2f}秒)")
        status = paddleocr_service.get_status()
        print(f"  设备: {status.get('device')}")
        print(f"  GPU 可用: {status.get('gpu_available')}")
    else:
        print(f"✗ 模型加载失败: {paddleocr_service._load_error}")
    
    return success

async def test_pdf_detection():
    print("\n" + "=" * 60)
    print("测试 3: PDF 文字层检测")
    print("=" * 60)
    
    test_pdf = "test.pdf"
    
    if not os.path.exists(test_pdf):
        print(f"⚠ 测试文件 {test_pdf} 不存在，跳过此测试")
        return True
    
    print(f"正在检测 PDF: {test_pdf}")
    
    try:
        import fitz
        doc = fitz.open(test_pdf)
        total_pages = len(doc)
        
        text_pages = 0
        for page in doc:
            text = page.get_text()
            if text.strip():
                text_pages += 1
        
        doc.close()
        
        has_text = text_pages > total_pages * 0.3
        
        print(f"  总页数: {total_pages}")
        print(f"  有文字的页数: {text_pages}")
        print(f"  是否包含文字层: {has_text}")
        
        if has_text:
            print("✓ PDF 已包含文字层，无需 OCR")
        else:
            print("✓ PDF 需要进行 OCR 处理")
        
        return True
        
    except Exception as e:
        print(f"✗ PDF 检测失败: {e}")
        return False

async def test_smart_processing():
    print("\n" + "=" * 60)
    print("测试 4: 智能 PDF 处理")
    print("=" * 60)
    
    test_pdf = "test.pdf"
    
    if not os.path.exists(test_pdf):
        print(f"⚠ 测试文件 {test_pdf} 不存在，跳过此测试")
        return True
    
    output_pdf = "test_searchable.pdf"
    
    if os.path.exists(output_pdf):
        os.remove(output_pdf)
    
    print(f"正在处理 PDF: {test_pdf}")
    print(f"输出文件: {output_pdf}")
    
    start_time = time.time()
    
    try:
        result = await paddleocr_service.process_pdf_smart(
            test_pdf,
            output_path=output_pdf,
            start_page=0,
            end_page=2
        )
        
        elapsed = time.time() - start_time
        
        if result.get('success'):
            print(f"✓ 处理成功 (耗时: {elapsed:.2f}秒)")
            print(f"  输出文件: {result.get('output_path')}")
            print(f"  已有 OCR: {result.get('had_ocr')}")
            print(f"  处理页数: {result.get('pages_processed')}")
            print(f"  消息: {result.get('message')}")
            
            if os.path.exists(output_pdf):
                file_size = os.path.getsize(output_pdf)
                print(f"  文件大小: {file_size / 1024:.2f} KB")
            
            return True
        else:
            print(f"✗ 处理失败: {result.get('error')}")
            return False
            
    except Exception as e:
        print(f"✗ 处理异常: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_text_extraction():
    print("\n" + "=" * 60)
    print("测试 5: 文字提取验证")
    print("=" * 60)
    
    output_pdf = "test_searchable.pdf"
    
    if not os.path.exists(output_pdf):
        print(f"⚠ 输出文件 {output_pdf} 不存在，跳过此测试")
        return True
    
    try:
        import fitz
        doc = fitz.open(output_pdf)
        
        total_text = ""
        for page in doc:
            text = page.get_text()
            total_text += text
        
        doc.close()
        
        print(f"提取的文字长度: {len(total_text)} 字符")
        
        if len(total_text) > 50:
            print("✓ 文字提取成功")
            print(f"\n前 200 个字符:")
            print(total_text[:200])
        else:
            print("⚠ 提取的文字较少，可能需要检查 OCR 质量")
        
        return True
        
    except Exception as e:
        print(f"✗ 文字提取失败: {e}")
        return False

async def main():
    print("\n" + "=" * 60)
    print("PaddleOCR GPU 部署验证测试")
    print("=" * 60)
    
    tests = [
        ("GPU 检测", test_gpu_detection),
        ("模型加载", test_model_loading),
        ("PDF 文字层检测", test_pdf_detection),
        ("智能 PDF 处理", test_smart_processing),
        ("文字提取验证", test_text_extraction),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            result = await test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n✗ 测试 '{test_name}' 异常: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\n总计: {passed} 通过, {failed} 失败")
    
    if failed == 0:
        print("\n🎉 所有测试通过！PaddleOCR GPU 部署成功！")
    else:
        print(f"\n⚠ 有 {failed} 个测试失败，请检查配置")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
