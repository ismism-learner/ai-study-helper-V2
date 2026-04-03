@echo off
chcp 65001 >nul
title 一键安装所有依赖

echo.
echo ========================================
echo   一键安装所有依赖（自动优化）
echo ========================================
echo.

cd /d "%~dp0"
cd backend

echo [步骤 1/4] 升级 pip...
python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1

echo [步骤 2/4] 安装基础依赖（约1-2分钟）...
python -m pip install fastapi==0.109.0 uvicorn==0.27.0 sqlalchemy==2.0.25 pydantic==2.5.3 pydantic-settings==2.1.0 python-multipart==0.0.6 httpx==0.26.0 openai==1.12.0 python-dotenv==1.0.0 python-docx==1.1.0 PyMuPDF==1.24.0 Pillow==10.2.0 aiofiles==23.2.1 -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet

if errorlevel 1 (
    echo [错误] 基础依赖安装失败，请检查网络连接
    pause
    exit /b 1
)
echo       基础依赖安装完成 ✓

echo.
echo [步骤 3/4] 安装 PaddlePaddle（约3-5分钟）...
echo       正在下载 GPU 版本（约500MB），请耐心等待...

python -m pip install paddlepaddle-gpu==2.6.1 -i https://mirror.baidu.com/pypi/simple --quiet

if errorlevel 1 (
    echo       [提示] GPU 版本安装失败，自动切换到 CPU 版本...
    python -m pip install paddlepaddle==2.6.1 -i https://mirror.baidu.com/pypi/simple --quiet
    if errorlevel 1 (
        echo       [警告] PaddlePaddle 安装失败，跳过 OCR 功能
        goto skip_ocr
    )
)
echo       PaddlePaddle 安装完成 ✓

echo.
echo [步骤 4/4] 安装 PaddleOCR 和 OCRmyPDF（约1-2分钟）...
python -m pip install paddleocr==2.7.3 -i https://mirror.baidu.com/pypi/simple --quiet
python -m pip install ocrmypdf==15.4.2 -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet

if errorlevel 1 (
    echo       [警告] OCR 工具安装失败，但核心功能可用
) else (
    echo       OCR 工具安装完成 ✓
)

:skip_ocr

cd ..

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo 正在验证安装...
echo.

python -c "import fastapi; print('✓ FastAPI:', fastapi.__version__)" 2>nul
python -c "import uvicorn; print('✓ Uvicorn:', uvicorn.__version__)" 2>nul
python -c "import fitz; print('✓ PyMuPDF:', fitz.__version__)" 2>nul
python -c "import paddle; print('✓ PaddlePaddle:', paddle.__version__)" 2>nul
python -c "from paddleocr import PaddleOCR; print('✓ PaddleOCR 可用')" 2>nul

echo.
echo ========================================
echo   现在可以运行 一键启动.bat 启动服务
echo ========================================
echo.
pause
