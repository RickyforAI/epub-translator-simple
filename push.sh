#!/bin/bash
# 请将 YOUR_GITHUB_TOKEN 替换为您的实际 GitHub Personal Access Token
# 获取 token: https://github.com/settings/tokens

echo "推送代码到 GitHub..."
git push https://RickyforAI:YOUR_GITHUB_TOKEN@github.com/RickyforAI/epub-translator-simple.git master

echo "推送完成！"