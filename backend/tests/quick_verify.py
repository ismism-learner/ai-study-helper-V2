"""
快速验证脚本 - 非交互式

直接运行所有测试，无需用户输入
"""

import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_gpu_detection():
    """测试GPU检测"""
    print("\n" + "="*60)
    print("【测试1】GPU检测")
    print("="*60)

    try:
        import paddle
        print(f"PaddlePaddle 版本: {paddle.__version__}")
        print(f"CUDA 可用: {paddle.is_compiled_with_cuda()}")

        if paddle.is_compiled_with_cuda():
            print(f"GPU 数量: {paddle.device.cuda.device_count()}")
            if paddle.device.cuda.device_count() > 0:
                print(f"GPU 名称: {paddle.device.cuda.get_device_name(0)}")

        import subprocess
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=memory.total,memory.used,memory.free',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=2
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(',')
            if len(parts) >= 3:
                total = float(parts[0].strip())
                used = float(parts[1].strip())
                free = float(parts[2].strip())
                print("\n显存状态:")
                print(f"  总显存: {total:.0f} MB ({total/1024:.1f} GB)")
                print(f"  已使用: {used:.0f} MB ({used/1024:.1f} GB)")
                print(f"  可用: {free:.0f} MB ({free/1024:.1f} GB)")

        print("\n✅ GPU检测成功")
        return True

    except Exception as e:
        print(f"\n❌ GPU检测失败: {e}")
        return False


def test_single_instance_vram():
    """测试单实例显存占用"""
    print("\n" + "="*60)
    print("【测试2】单实例显存占用")
    print("="*60)

    try:
        import numpy as np
        import paddle
        from paddleocr import PaddleOCR

        print("正在初始化PaddleOCR实例...")
        start = time.time()

        ocr = PaddleOCR(
            use_angle_cls=True,
            lang='ch',
            use_gpu=True,
            show_log=False
        )

        print(f"初始化耗时: {time.time() - start:.2f}秒")

        print("正在预热模型...")
        dummy = np.zeros((100, 100, 3), dtype=np.uint8)
        _ = ocr.ocr(dummy, cls=True)

        paddle.device.cuda.empty_cache()
        allocated = paddle.device.cuda.memory_allocated(0) / 1024**3
        reserved = paddle.device.cuda.memory_reserved(0) / 1024**3

        print("\n显存占用:")
        print(f"  已分配: {allocated:.2f} GB")
        print(f"  预留: {reserved:.2f} GB")
        print(f"  总计: {allocated + reserved:.2f} GB")

        print("\n✅ 单实例显存测试成功")
        return True, allocated + reserved

    except Exception as e:
        print(f"\n❌ 单实例显存测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False, 0


def _process_single_test(img_path):
    """测试用的单图处理函数（必须是模块级函数才能被pickle）"""
    from paddleocr import PaddleOCR
    ocr = PaddleOCR(
        use_angle_cls=True,
        lang='ch',
        use_gpu=True,
        show_log=False
    )
    return ocr.ocr(img_path, cls=True)


def test_batch_inference():
    """测试多进程并行处理"""
    print("\n" + "="*60)
    print("【测试3】多进程并行处理")
    print("="*60)

    try:
        import concurrent.futures
        import tempfile

        import numpy as np
        import paddle
        from paddleocr import PaddleOCR

        ocr = PaddleOCR(
            use_angle_cls=True,
            lang='ch',
            use_gpu=True,
            show_log=False
        )

        print("\n创建测试图片...")
        test_images = []
        for i in range(8):
            img = np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)
            img_path = os.path.join(tempfile.gettempdir(), f"test_mp_{i}.png")

            from PIL import Image
            Image.fromarray(img).save(img_path)
            test_images.append(img_path)

        print(f"创建了 {len(test_images)} 张测试图片")

        print("\n单进程处理 (顺序)...")
        paddle.device.cuda.empty_cache()
        start = time.time()
        for img_path in test_images:
            _ = ocr.ocr(img_path, cls=True)
        single_time = time.time() - start
        print(f"  耗时: {single_time:.2f}秒")

        print("\n多进程处理 (2 Workers)...")
        paddle.device.cuda.empty_cache()
        start = time.time()
        with concurrent.futures.ProcessPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(_process_single_test, img_path) for img_path in test_images]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        multi_time = time.time() - start
        print(f"  耗时: {multi_time:.2f}秒")
        print(f"  加速比: {single_time/multi_time:.2f}x")

        for img_path in test_images:
            try:
                os.unlink(img_path)
            except:
                pass

        print("\n✅ 多进程并行处理测试成功")
        return True

    except Exception as e:
        print(f"\n❌ 多进程并行处理测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_ocr_service():
    """测试OCR服务"""
    print("\n" + "="*60)
    print("【测试4】OCR服务测试")
    print("="*60)

    try:
        from app.services.paddleocr_service import paddleocr_service

        print("服务状态:")
        status = paddleocr_service.get_status()
        for key, value in status.items():
            print(f"  {key}: {value}")

        print("\n正在加载模型...")
        success = await paddleocr_service.load_model()

        if not success:
            print(f"❌ 模型加载失败: {paddleocr_service._load_error}")
            return False

        print("✅ 模型加载成功")

        print("\n服务状态:")
        status = paddleocr_service.get_status()
        for key, value in status.items():
            print(f"  {key}: {value}")

        return True

    except Exception as e:
        print(f"\n❌ OCR服务测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_pdf_ocr_order():
    """测试PDF OCR顺序"""
    print("\n" + "="*60)
    print("【测试5】PDF OCR顺序测试")
    print("="*60)

    try:
        import fitz
        import numpy as np
        from PIL import Image, ImageDraw, ImageFont

        from app.services.paddleocr_service import paddleocr_service

        print("创建测试PDF...")
        pdf_path = os.path.join(tempfile.gettempdir(), "test_order_5pages.pdf")

        doc = fitz.open()
        for page_num in range(1, 6):
            img = Image.new('RGB', (400, 300), color='white')
            draw = ImageDraw.Draw(img)

            try:
                font = ImageFont.truetype("arial.ttf", 36)
            except:
                font = ImageFont.load_default()

            text = f"PAGE_{page_num:03d}"
            draw.text((100, 130), text, fill='black', font=font)

            img_path = os.path.join(tempfile.gettempdir(), f"temp_test_{page_num}.png")
            img.save(img_path)

            page = doc.new_page(width=400, height=300)
            page.insert_image(fitz.Rect(0, 0, 400, 300), filename=img_path)
            os.unlink(img_path)

        doc.save(pdf_path)
        doc.close()
        print(f"测试PDF已创建: {pdf_path}")

        print("\n开始OCR处理...")
        result = await paddleocr_service.extract_text_from_pdf(pdf_path)

        if not result.get('success'):
            print(f"❌ OCR处理失败: {result.get('error')}")
            return False

        print("\n处理完成:")
        print(f"  页数: {result.get('pages_processed')}")
        print(f"  Workers: {result.get('workers_used')}")
        print(f"  Batch Size: {result.get('batch_size_used')}")

        print("\n顺序验证:")
        pages = result.get('pages', [])
        all_correct = True

        for page in pages:
            page_num = page.get('page_number', 0)
            text = page.get('text', '')

            expected_marker = f"PAGE_{page_num:03d}"
            expected_marker_alt = f"PAGE\n{page_num:03d}"

            if expected_marker in text or expected_marker_alt in text.replace('\n', ''):
                print(f"  ✓ 第{page_num}页: 顺序正确，内容匹配")
            else:
                clean_text = text.replace('\n', '').replace(' ', '')
                clean_expected = expected_marker.replace('_', '')
                if clean_expected in clean_text:
                    print(f"  ✓ 第{page_num}页: 顺序正确，内容匹配（OCR格式差异）")
                else:
                    print(f"  ❌ 第{page_num}页: 内容不匹配")
                    print(f"     期望: {expected_marker}")
                    print(f"     实际: {text[:50]}...")
                    all_correct = False

        try:
            os.unlink(pdf_path)
        except:
            pass

        if all_correct:
            print("\n✅ PDF OCR顺序测试成功")
            return True
        else:
            print("\n❌ PDF OCR顺序测试失败")
            return False

    except Exception as e:
        print(f"\n❌ PDF OCR顺序测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    print("\n" + "="*60)
    print("  OCR 多进程+批量推理 快速验证")
    print("="*60)

    results = {}

    results['gpu_detection'] = test_gpu_detection()

    if not results['gpu_detection']:
        print("\n❌ GPU检测失败，无法继续测试")
        return

    results['single_instance'], vram = test_single_instance_vram()
    results['batch_inference'] = test_batch_inference()
    results['ocr_service'] = asyncio.run(test_ocr_service())
    results['pdf_ocr_order'] = asyncio.run(test_pdf_ocr_order())

    print("\n" + "="*60)
    print("【测试报告】")
    print("="*60)

    all_passed = True
    for test_name, passed in results.items():
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"  {test_name}: {status}")
        if not passed:
            all_passed = False

    print("="*60)

    if all_passed:
        print("\n🎉 所有测试通过！方案可行")
    else:
        print("\n⚠️ 部分测试失败，请检查日志")


if __name__ == "__main__":
    main()
