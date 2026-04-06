@echo off
chcp 65001 >nul
title AI Study Helper

echo.
echo ========================================
echo   AI Study Helper V2
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo      [Error] Python not found, please install Python 3.8+
    pause
    exit /b 1
)
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo      Python %PYTHON_VER% installed

echo.
echo [2/4] Checking backend dependencies...
python -c "import fastapi, uvicorn, fitz" >nul 2>&1
if errorlevel 1 (
    echo      First run, installing backend dependencies...
    echo.
    
    echo      [2.1] Upgrading pip...
    python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1
    
    echo      [2.2] Installing base dependencies...
    python -m pip install fastapi==0.109.0 uvicorn==0.27.0 sqlalchemy==2.0.25 pydantic==2.5.3 pydantic-settings==2.1.0 python-multipart==0.0.6 httpx==0.26.0 openai==1.12.0 python-dotenv==1.0.0 python-docx==1.1.0 PyMuPDF==1.24.0 Pillow==10.2.0 aiofiles==23.2.1 -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet
    
    echo      [2.3] Installing PaddlePaddle...
    python -m pip install paddlepaddle-gpu==2.6.1 -i https://mirror.baidu.com/pypi/simple --quiet >nul 2>&1
    if errorlevel 1 (
        echo      [Info] GPU version not available, installing CPU version...
        python -m pip install paddlepaddle==2.6.1 -i https://mirror.baidu.com/pypi/simple --quiet >nul 2>&1
    )
    
    echo      [2.4] Installing PaddleOCR...
    python -m pip install paddleocr==2.7.3 -i https://mirror.baidu.com/pypi/simple --quiet >nul 2>&1
    
    echo      Backend dependencies installed
) else (
    echo      Backend dependencies ready
)

echo.
echo [3/4] Checking frontend dependencies...
cd frontend
if not exist "node_modules" (
    echo      First run, installing frontend dependencies...
    call npm install --silent
    echo      Frontend dependencies installed
) else (
    echo      Frontend dependencies ready
)
cd ..

echo.
echo [4/4] Starting services...
echo.

echo      Starting backend (port 8000)...
cd backend
start "Backend Service" /min cmd /c "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
cd ..

timeout /t 3 /nobreak >nul

echo      Starting frontend (port 3001)...
cd frontend
start "Frontend Service" /min cmd /c "npm run dev"
cd ..

echo.
echo ========================================
echo   Startup Complete!
echo ========================================
echo.
echo   Frontend: http://localhost:3001
echo   Backend:  http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo.
echo ========================================
echo.

timeout /t 3 /nobreak >nul

echo Opening browser...
start http://localhost:3001

echo.
echo Press any key to close this window (services will continue running)
pause >nul
