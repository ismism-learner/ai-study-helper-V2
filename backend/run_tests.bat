@echo off
chcp 65001 >nul
echo ============================================
echo   OCR 测试脚本启动器
echo ============================================
echo.

cd /d "%~dp0"

echo 请选择测试类型:
echo.
echo   1. 显存占用测试 (test_vram_usage.py)
echo      - 测试单个PaddleOCR实例显存占用
echo      - 测试不同Batch Size的显存和速度
echo      - 推荐最优Worker数量和Batch Size
echo.
echo   2. OCR顺序正确性测试 (test_ocr_order.py)
echo      - 验证多进程+批量推理结果顺序
echo      - 验证内容与页码对应关系
echo      - 性能对比测试
echo.
echo   3. 完整测试 (先显存测试，再顺序测试)
echo.
echo   0. 退出
echo.

set /p choice="请输入选项 (0-3): "

if "%choice%"=="1" goto vram_test
if "%choice%"=="2" goto order_test
if "%choice%"=="3" goto full_test
if "%choice%"=="0" goto end
goto invalid

:vram_test
echo.
echo 正在启动显存占用测试...
echo.
python tests\test_vram_usage.py
goto end

:order_test
echo.
set /p pdf_path="请输入PDF文件路径 (留空则创建测试PDF): "
if "%pdf_path%"=="" (
    echo 正在启动顺序正确性测试 (使用测试PDF)...
    python tests\test_ocr_order.py
) else (
    echo 正在启动顺序正确性测试 (使用指定PDF)...
    python tests\test_ocr_order.py --pdf "%pdf_path%"
)
goto end

:full_test
echo.
echo ===== 第一步：显存占用测试 =====
python tests\test_vram_usage.py
echo.
echo ===== 第二步：顺序正确性测试 =====
set /p pdf_path="请输入PDF文件路径 (留空则创建测试PDF): "
if "%pdf_path%"=="" (
    python tests\test_ocr_order.py --performance
) else (
    python tests\test_ocr_order.py --pdf "%pdf_path%" --performance
)
goto end

:invalid
echo.
echo 无效选项，请重新运行脚本
goto end

:end
echo.
echo 测试完成
pause
