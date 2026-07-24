// test-conn.mjs — 验证 DeepSeek 是否调通（需先在 .env 填入真实 key）
import './config.js';
import { callDeepSeek } from './deepseek.js';
import { buildSinglePrompt, buildMultiPrompt } from './prompts.js';

const key = process.env.DEEPSEEK_API_KEY;
if (!key || key.startsWith('sk-xxxxxxxx')) {
  console.error('✖ 请先在 .env 中填入真实的 DEEPSEEK_API_KEY（参考 .env.example）');
  process.exit(1);
}

const cases = [
  ['场景1 单字「route」', buildSinglePrompt('route')],
  ['场景2 多词「period stage phase」', buildMultiPrompt(['period', 'stage', 'phase'])],
];

for (const [label, prompt] of cases) {
  try {
    console.log(`\n→ 测试 ${label} ...`);
    const data = await callDeepSeek(prompt);
    console.log('  ✅ 调通，mode =', data.mode, '| 字段：', Object.keys(data).join(', '));
    console.log('  ' + JSON.stringify(data).slice(0, 360));
  } catch (e) {
    console.error('  ❌ 失败：', e.message);
    process.exit(1);
  }
}
console.log('\n全部调通 ✅');
