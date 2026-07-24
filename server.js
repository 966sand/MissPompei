// server.js — Miss Sorrento 后端（零外部依赖，Node 20+ 内置 http + fetch）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORT } from './config.js';
import { validateInput, toTokens } from './validate.js';
import { buildSinglePrompt, buildMultiPrompt } from './prompts.js';
import { callDeepSeek } from './deepseek.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('请求体过大'));
      }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  // 防目录穿越
  if (!filePath.startsWith(PUBLIC_DIR + sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    const mt = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mt });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

async function handleAnalyze(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '请求格式错误' }));
  }

  const v = validateInput(body?.input || '');
  if (!v.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: v.msg }));
  }

  const tokens = toTokens(v.normalized);
  const mode = tokens.length >= 2 ? 'multi' : 'single';
  const userPrompt =
    mode === 'multi' ? buildMultiPrompt(tokens) : buildSinglePrompt(tokens[0]);

  try {
    const data = await callDeepSeek(userPrompt);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'DeepSeek 调用失败' }));
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      return await handleAnalyze(req, res);
    }
    if (req.method === 'GET') {
      return await serveStatic(url.pathname, res);
    }
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '服务器内部错误' }));
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Miss Sorrento 已启动： http://localhost:${PORT}`);
  if (!existsSync(join(__dirname, '.env'))) {
    console.warn('提示：未检测到 .env 文件，DeepSeek 调用将返回 500。请复制 .env.example 为 .env 并填入 DEEPSEEK_API_KEY。');
  }
});
