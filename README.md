# Miss Pompei · 英语同义词辨析助手

移动端网页应用：输入一个或几个英语单词，给出音标、中文意思、用法、例句，以及同义词/多词之间的用法差异辨析。
后端调用 **DeepSeek** 生成内容，零外部依赖（仅用 Node 20+ 内置 `http` 与 `fetch`）。

## 目录结构

```
miss-sorrento/
├── server.js        # 后端：静态托管 + /api/analyze
├── config.js        # 读取 .env 配置
├── validate.js      # 输入校验（1–100 字符 / 含任意中文字符即拦截）
├── prompts.js       # 单/多词 prompt 模板（强制 JSON schema）
├── deepseek.js      # DeepSeek 调用 + 解析兜底
├── test-conn.mjs    # 端到端连通性测试
├── .env.example     # 配置样例
├── public/          # 前端
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── package.json
```

## 快速开始

```bash
# 1. 配置 Key
cp .env.example .env
#   编辑 .env，填入你的 DEEPSEEK_API_KEY=sk-...

# 2. 启动（无需 npm install）
node server.js
#   打开 http://localhost:3000
```

## 验证 DeepSeek 是否调通

```bash
node test-conn.mjs
```

会依次测试「单字 route」与「多词 period stage phase」两个场景，打印返回字段。

## 输入规则（前端 + 后端双重拦截）

- 长度 1–100 个字符；超过 100 → 「暂不支持超过100个字符的长度」
- 含任意中文字符（≥1 个）→ 「不支持中文输入」
- 单个单词走「场景1（单词 + 同义词差异）」；空格分隔的多个单词走「场景2（多词对比）」

## API

`POST /api/analyze`

```json
// 请求
{ "input": "route" }
// 或
{ "input": "period stage phase" }

// 响应（场景1）
{
  "mode": "single",
  "primary": { "word": "route", "phonetic": "/ruːt/", "pos": "n.", "cn_meaning": "...", "usage": "...", "examples": [{"en":"...","cn":"..."}, {"en":"...","cn":"..."}] },
  "synonyms": [ ... 同结构 ... ],
  "analysis": { "quick_compare":[...], "contrast_examples":[...], "exclusive_usage":[...], "summary":"..." }
}

// 响应（场景2）
{
  "mode": "multi",
  "words": [ ... 每个单词一张卡 ... ],
  "analysis": { "overall_table": {...}, "exclusive":[...], "summary":"..." }
}
```

## 部署上线（第三步，轻量方案）

应用**零外部依赖**，前端 + 后端可一起托管到支持 Node 的平台（Render / Railway / Fly.io），平台会分配免费子域名（如 `xxx.onrender.com`），**无需先买域名**。

### 一、准备 Git 仓库（把本目录推上去）

```bash
cd miss-sorrento
git init
git add .
git commit -m "Miss Pompei 初始版本"
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

> `.env` 已被 `.gitignore` 排除，Key 不会进仓库。

### 二、选一个平台部署

**方案 A：Render（推荐，最简单）**

1. 登录 render.com → **New** → **Blueprint**
2. 关联上面的 GitHub 仓库（自动读取仓库里的 `render.yaml`）
3. 在 **Environment** 新增变量：`DEEPSEEK_API_KEY` = 你的 `sk-...`
4. 点 Create，等待部署完成 → 得到 `https://miss-sorrento.onrender.com`

**方案 B：Railway**

1. 登录 railway.app → **New Project** → **Deploy from GitHub repo**
2. 平台自动识别 `Dockerfile` / `Procfile`
3. 在 **Variables** 加 `DEEPSEEK_API_KEY` = 你的 `sk-...`
4. 部署完成 → 得到 `https://miss-sorrento.up.railway.app`

### 三、关键提醒

- **Key 只填在平台的环境变量里**，不要提交到代码仓库。
- 免费套餐服务休眠后首次访问可能慢几秒，属正常。
- 后期想绑自己的域名：等平台跑稳后，在控制台添加 Custom Domain 即可。
