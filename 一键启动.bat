@echo off
chcp 65001 >nul
title 交互式文档增强系统

echo.
echo ========================================
echo   交互式文档增强系统
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo       [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)
for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo       Python %PYTHON_VER% 已安装

echo.
echo [2/4] 检查后端依赖...
python -c "import fastapi, uvicorn, fitz" >nul 2>&1
if errorlevel 1 (
    echo       首次运行，正在安装后端依赖...
    echo.
    
    echo       [2.1] 升级 pip...
    python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1
    
    echo       [2.2] 安装基础依赖（约1-2分钟）...
    python -m pip install fastapi==0.109.0 uvicorn==0.27.0 sqlalchemy==2.0.25 pydantic==2.5.3 pydantic-settings==2.1.0 python-multipart==0.0.6 httpx==0.26.0 openai==1.12.0 python-dotenv==1.0.0 python-docx==1.1.0 PyMuPDF==1.24.0 Pillow==10.2.0 aiofiles==23.2.1 -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet
    
    echo       [2.3] 安装 PaddlePaddle（约3-5分钟）...
    python -m pip install paddlepaddle-gpu==2.6.1 -i https://mirror.baidu.com/pypi/simple --quiet >nul 2>&1
    if errorlevel 1 (
        echo       [提示] GPU 版本不可用，安装 CPU 版本...
        python -m pip install paddlepaddle==2.6.1 -i https://mirror.baidu.com/pypi/simple --quiet >nul 2>&1
    )
    
    echo       [2.4] 安装 PaddleOCR...
    python -m pip install paddleocr==2.7.3 -i https://mirror.baidu.com/pypi/simple --quiet >nul 2>&1
    
    echo       后端依赖安装完成
) else (
    echo       后端依赖已就绪
)

echo.
echo [3/4] 检查前端依赖...
cd frontend
if not exist "node_modules" (
    echo       首次运行，正在安装前端依赖（约1-2分钟）...
    call npm install --silent
    echo       前端依赖安装完成
) else (
    echo       前端依赖已就绪
)
cd ..

echo.
echo [4/4] 启动服务...
echo.

echo       启动后端服务 (端口 8000)...
cd backend
start "后端服务" /min cmd /c "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
cd ..

timeout /t 3 /nobreak >nul

echo       启动前端服务 (端口 3001)...
cd frontend
start "前端服务" /min cmd /c "npm run dev"
cd ..

echo.
echo ========================================
echo   启动完成！
echo ========================================
echo.
echo   前端界面: http://localhost:3001
echo   后端API:  http://localhost:8000
echo   API文档:  http://localhost:8000/docs
echo.
echo   请确保您的 new-API 服务已在
echo   http://localhost:3000 运行
echo.
echo ========================================
echo.

timeout /t 3 /nobreak >nul

echo 正在打开浏览器...
start http://localhost:3001

echo.
echo 按任意键关闭此窗口（服务将继续在后台运行）
pause >nul
