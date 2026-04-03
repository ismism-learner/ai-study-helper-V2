@echo off
chcp 65001 >nul
title 首次安装

echo.
echo ========================================
echo   交互式文档增强系统 - 首次安装
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 安装后端依赖...
cd backend
python -m pip install -r requirements.txt
cd ..

echo.
echo [2/2] 安装前端依赖...
cd frontend
call npm install
cd ..

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo   请确认 backend\.env 文件已正确配置：
echo   - OPENAI_API_KEY
echo   - OPENAI_API_BASE
echo.
echo   然后双击 "一键启动.bat" 启动系统
echo.
echo ========================================
pause
