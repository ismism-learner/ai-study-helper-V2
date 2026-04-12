import os
import re

# 前端API目录
api_dir = "src/api"
frontend_dir = "src"

# 收集所有API调用
all_api_calls = set()

# 1. 分析api目录下的模块
for filename in os.listdir(api_dir):
    if filename.endswith(".ts") and filename not in ["index.ts", "client.ts"]:
        filepath = os.path.join(api_dir, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            # 匹配各种API路径模式
            # 1. 直接字符串 '/api/xxx'
            for match in re.finditer(r"['\"`](/api/[^'\"`]+)['\"`]", content):
                all_api_calls.add(match.group(1))
            # 2. 模板字符串中的路径 `/api/xxx`
            for match in re.finditer(r"`([^`]*\/api\/[^`]+)`", content):
                path = match.group(1)
                # 提取静态部分
                if "/api/" in path:
                    # 移除变量插值
                    static_path = re.sub(r"\$\{[^}]+\}", "{param}", path)
                    static_path = re.sub(r"\$\([^)]+\)", "{param}", static_path)
                    all_api_calls.add(static_path)

# 2. 分析components目录下的直接API调用
for root, dirs, files in os.walk(os.path.join(frontend_dir, "components")):
    for filename in files:
        if filename.endswith(".tsx"):
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                    for match in re.finditer(r"['\"`](/api/[^'\"`]+)['\"`]", content):
                        all_api_calls.add(match.group(1))
            except:
                pass

# 标准化路径
normalized = set()
for call in all_api_calls:
    # 移除变量部分，标准化为模板
    normalized_call = re.sub(r"\$\{[^}]+\}", "{id}", call)
    normalized_call = (
        re.sub(r"/[^/]+$", "{id}", normalized_call)
        if normalized_call.count("/") > 2
        else normalized_call
    )
    normalized.add(normalized_call)

print("前端调用的API路径:")
for call in sorted(normalized):
    print(call)

print(f"\n总计: {len(normalized)} 个唯一API路径")
