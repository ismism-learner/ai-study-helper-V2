@echo off
chcp 65001 >nul
echo ========================================
echo PaddleOCR 快速测试脚本
echo ========================================
echo.

echo 正在运行完整的工作流测试...
echo.

python test_paddleocr_workflow.py

echo.
echo ========================================
echo 测试完成
echo ========================================
echo.
echo 接下来您可以：
echo   1. 运行 一键启动.bat 启动完整服务
echo   2. 访问 http://localhost:8000/docs 查看 API 文档
echo   3. 使用 API 接口处理您的 PDF 文件
echo.
pause
