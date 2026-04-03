@echo off
chcp 65001 >nul
title 停止所有服务

echo.
echo ========================================
echo   停止所有服务
echo ========================================
echo.

echo 正在停止后端服务 (Python/uvicorn)...
taskkill /f /im python.exe 2>nul
if errorlevel 1 (
    echo   未找到运行中的后端服务
) else (
    echo   后端服务已停止 ✓
)

echo.
echo 正在停止前端服务 (Node)...
taskkill /f /im node.exe 2>nul
if errorlevel 1 (
    echo   未找到运行中的前端服务
) else (
    echo   前端服务已停止 ✓
)

echo.
echo ========================================
echo   所有服务已停止
echo ========================================
echo.
pause
