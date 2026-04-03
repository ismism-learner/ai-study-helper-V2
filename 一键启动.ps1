# 交互式文档增强系统 - 一键启动脚本

Write-Host ""
Write-Host "========================================"
Write-Host "  交互式文档增强系统 - 一键启动"
Write-Host "========================================"
Write-Host ""

Set-Location $PSScriptRoot

Write-Host "[1/3] 检查 Python 环境..."
python --version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 未找到 Python" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}
Write-Host "      Python 已安装" -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] 检查核心依赖..."
python -c "import fastapi, uvicorn, fitz" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      正在安装依赖..." -ForegroundColor Yellow
    Set-Location backend
    python -m pip install fastapi==0.109.0 uvicorn==0.27.0 sqlalchemy==2.0.25 pydantic==2.5.3 pydantic-settings==2.1.0 python-multipart==0.0.6 httpx==0.26.0 openai==1.12.0 python-dotenv==1.0.0 python-docx==1.1.0 PyMuPDF==1.24.0 Pillow==10.2.0 aiofiles==23.2.1 -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet 2>&1 | Out-Null
    Set-Location ..
    Write-Host "      依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "      依赖已就绪" -ForegroundColor Green
}

Write-Host ""
Write-Host "[3/3] 启动服务..."
Write-Host ""

Write-Host "启动后端服务 (端口 8000)..."
Set-Location backend
Start-Process python -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" -WindowStyle Minimized
Set-Location ..

Start-Sleep -Seconds 3

Write-Host "启动前端服务 (端口 3001)..."
Set-Location frontend
if (-not (Test-Path node_modules)) {
    Write-Host "      安装前端依赖..."
    npm install --silent 2>&1 | Out-Null
}
Start-Process npm -ArgumentList "run", "dev" -WindowStyle Minimized
Set-Location ..

Write-Host ""
Write-Host "========================================"
Write-Host "  启动完成！"
Write-Host "========================================"
Write-Host ""
Write-Host "  前端界面: http://localhost:3001"
Write-Host "  后端API:  http://localhost:8000"
Write-Host "  API文档:  http://localhost:8000/docs"
Write-Host ""
Write-Host "========================================"
Write-Host ""

Start-Sleep -Seconds 3

Write-Host "正在打开浏览器..."
Start-Process "http://localhost:3001"

Write-Host ""
Write-Host "按任意键关闭此窗口"
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
