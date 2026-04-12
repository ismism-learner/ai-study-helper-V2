import os
import re

# 搜索前端所有ts/tsx文件中的API调用
frontend_dir = "src"
api_calls = set()

# 匹配各种API调用模式
patterns = [
    r"['\"](/api/[^'\"]+)['\"]",  # 直接字符串路径
    r"`(/api/[^`]+)`",  # 模板字符串
    r"\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]",  # axios风格
]

for root, dirs, files in os.walk(frontend_dir):
    for filename in files:
        if filename.endswith((".ts", ".tsx")):
            filepath = os.path.join(root, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
                # 匹配 /api/ 开头的路径
                for match in re.finditer(r"['\"`](/api/[^'\"`]+)['\"`]", content):
                    api_calls.add(match.group(1))

for call in sorted(api_calls):
    print(call)

print(f"\n总计: {len(api_calls)} 个前端API调用")
