@echo off
chcp 65001 >nul
title 交互式文档增强系统 - 一键启动

echo.
echo ========================================
echo   交互式文档增强系统 - 一键启动
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)
echo       Python 已安装 ✓

echo.
echo [2/4] 检查并安装后端依赖...
cd backend
python -m pip install -r requirements.txt -q
if errorlevel 1 (
    echo [警告] 后端依赖安装可能有问题，继续尝试启动...
) else (
    echo       后端依赖已就绪 ✓
)
cd ..

echo.
echo [3/4] 检查并安装前端依赖...
cd frontend
if not exist "node_modules" (
    echo       首次运行，正在安装前端依赖，请稍候...
    call npm install --silent
)
if errorlevel 1 (
    echo [警告] 前端依赖安装可能有问题，继续尝试启动...
) else (
    echo       前端依赖已就绪 ✓
)
cd ..

echo.
echo [4/4] 启动服务...
echo.

echo 启动后端服务 (端口 8000)...
cd backend
start "后端服务" /min cmd /c "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
cd ..

timeout /t 3 /nobreak >nul

echo 启动前端服务 (端口 3001)...
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
