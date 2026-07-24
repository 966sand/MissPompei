# 容器化部署（Railway / 任意支持 Docker 的平台）
FROM node:22-alpine
WORKDIR /app

# 仅复制清单先装依赖（利用层缓存）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev 2>/dev/null || true

# 复制应用代码
COPY . .

# Railway 会自动注入 PORT 环境变量；本地调试可用 -e PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
