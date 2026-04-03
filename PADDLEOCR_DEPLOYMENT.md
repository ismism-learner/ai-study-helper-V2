# PaddleOCR GPU 部署指南

## 系统要求

- **操作系统**: Windows 10/11
- **GPU**: NVIDIA GTX 1070 8G 或更高
- **CUDA**: 11.2 / 11.6 / 11.7 / 11.8
- **Python**: 3.8 - 3.11
- **显存**: 至少 4GB 可用显存

## 快速部署步骤

### 1. 安装 CUDA Toolkit（如果尚未安装）

访问 NVIDIA 官网下载并安装 CUDA Toolkit：
- CUDA 11.2: https://developer.nvidia.com/cuda-11.2.0-download-archive
- CUDA 11.6: https://developer.nvidia.com/cuda-11.6.0-download-archive
- CUDA 11.7: https://developer.nvidia.com/cuda-11.7.0-download-archive
- CUDA 11.8: https://developer.nvidia.com/cuda-11.8.0-download-archive

### 2. 运行环境配置脚本

双击运行 `setup_paddleocr_gpu.bat`，脚本将自动：
- 检测 GPU 和 CUDA 版本
- 安装 PaddlePaddle GPU 版本
- 安装 PaddleOCR 和其他依赖
- 验证安装是否成功

### 3. 运行测试脚本

双击运行 `test_paddleocr_setup.bat`，验证所有功能是否正常。

### 4. 启动服务

双击运行 `一键启动.bat` 启动后端服务。

## API 使用说明

### 1. 智能 PDF OCR 处理（推荐）

自动检测 PDF 是否已包含文字层，如果未包含则进行 OCR 处理：

```bash
POST /api/pdf-ocr/paddle/smart-process
Content-Type: application/json

{
  "file_path": "path/to/your/file.pdf",
  "output_path": "path/to/output_searchable.pdf",  // 可选
  "start_page": 0,  // 可选，默认 0
  "end_page": 10    // 可选，默认处理所有页面
}
```

**响应示例**：
```json
{
  "success": true,
  "output_path": "path/to/output_searchable.pdf",
  "had_ocr": false,
  "pages_processed": 10,
  "message": "OCR处理完成",
  "text_content": "提取的文字内容..."
}
```

### 2. 创建双层 PDF（强制 OCR）

无论 PDF 是否包含文字层，都进行 OCR 处理：

```bash
POST /api/pdf-ocr/paddle/create-searchable/{file_path}
?output_path=path/to/output.pdf
&start_page=0
&end_page=10
```

### 3. 异步处理大文件

对于大文件，使用异步接口避免超时：

```bash
# 启动异步处理
POST /api/pdf-ocr/paddle/smart-process-async/{file_path}

# 查询处理状态
GET /api/pdf-ocr/paddle/smart-status/{file_path}
```

### 4. 检查 PaddleOCR 状态

```bash
GET /api/pdf-ocr/paddle/status
```

**响应示例**：
```json
{
  "model_loaded": true,
  "loading": false,
  "error": null,
  "device": "gpu",
  "gpu_available": true
}
```

## 性能优化建议

### 1. GPU 显存优化

对于 GTX 1070 8G 显卡：

- **单页处理**: 显存占用约 500MB - 1GB
- **批量处理**: 建议一次处理不超过 50 页
- **大文件**: 使用异步接口分批处理

### 2. 处理速度优化

- 使用 GPU 加速，速度比 CPU 快 5-10 倍
- 调整图像分辨率：默认 2.0 倍，可根据需要调整
- 对于清晰文档，可降低分辨率提高速度

### 3. 质量优化

- 使用 `use_angle_cls=True` 启用角度分类，提高倾斜文档识别率
- 对于中文文档，使用 `lang='ch'`
- 对于英文文档，使用 `lang='en'`

## 常见问题

### 1. CUDA 相关错误

**问题**: `CUDA out of memory`

**解决方案**:
- 减少批处理页面数量
- 降低图像分辨率
- 关闭其他占用 GPU 的程序

### 2. 模型加载失败

**问题**: 模型下载失败或加载错误

**解决方案**:
- 检查网络连接
- 手动下载模型文件到 `~/.paddleocr/` 目录
- 使用国内镜像源

### 3. PDF 处理失败

**问题**: PDF 文件损坏或格式不支持

**解决方案**:
- 使用 PDF 修复工具修复文件
- 转换为标准 PDF 格式
- 检查文件权限

## 测试示例

使用 curl 测试 API：

```bash
# 测试健康检查
curl http://localhost:8000/health

# 测试 PaddleOCR 状态
curl http://localhost:8000/api/pdf-ocr/paddle/status

# 智能 OCR 处理
curl -X POST http://localhost:8000/api/pdf-ocr/paddle/smart-process \
  -H "Content-Type: application/json" \
  -d "{\"file_path\": \"test.pdf\"}"
```

## 技术架构

```
前端请求
    ↓
API 路由层 (pdf_ocr.py)
    ↓
PaddleOCR 服务层 (paddleocr_service.py)
    ↓
├─ GPU 检测与初始化
├─ PDF 文字层检测
├─ 图像提取与预处理
├─ PaddleOCR 识别
└─ 双层 PDF 生成
    ↓
返回结果
```

## 依赖版本

- PaddlePaddle-GPU: 2.6.1
- PaddleOCR: 2.7.3
- PyMuPDF: 1.24.0
- OCRmyPDF: 15.4.2 (可选)
- FastAPI: 0.109.0

## 更新日志

### v1.0.0 (2024-01-XX)
- 初始版本发布
- 支持 GPU 加速 OCR
- 支持智能 PDF 处理
- 支持双层 PDF 生成
- 完整的 API 接口

## 技术支持

如遇问题，请检查：
1. GPU 驱动是否最新
2. CUDA 版本是否匹配
3. Python 版本是否兼容
4. 依赖包是否正确安装

更多信息请参考项目文档或提交 Issue。
