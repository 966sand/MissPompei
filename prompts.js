// prompts.js — DeepSeek 提示词模板（强制结构化 JSON 输出，只返回既定字段）

export const SYSTEM_PROMPT = `你是「英语同义词辨析助手」，只负责分析英语单词。
你必须严格按照用户给定的 JSON schema 输出，且只能包含 schema 中定义的字段。
不要输出任何额外说明、解释、注释，也不要用 markdown 代码块包裹（直接输出纯 JSON）。
所有释义、例句、辨析必须基于英语语言学事实，不得编造与规则无关的内容。`;

// 场景1：单个单词 + 同义词
export function buildSinglePrompt(word) {
  return `请分析英语单词「${word}」。

要求：
1. 给出该单词本身的：音标(IPA)、词性、中文意思、英文用法说明、2 个中英对照例句。
2. 给出 3-5 个最贴近的同义词，每个同样包含：音标、词性、中文意思、英文用法说明、2 个中英对照例句。
3. 给出该词与同义词的差异辨析，包含：
   - 双列速览（每个词一句话核心语义）
   - 对照例句（同一场景下分别用不同词造句，体会差异）
   - 互换性判断（何时只能用 A 不能用 B，用 ✓/✗ 标注正确与错误用法并说明规则）
   - 一句话记忆口诀/总结

只返回如下 JSON（不要任何额外文字）：
{
  "mode": "single",
  "primary": {
    "word": "${word}",
    "phonetic": "<IPA 音标>",
    "pos": "<词性，如 n.>",
    "cn_meaning": "<中文意思>",
    "usage": "<英文用法说明>",
    "examples": [
      {"en": "<例句>", "cn": "<中文翻译>"},
      {"en": "<例句>", "cn": "<中文翻译>"}
    ]
  },
  "synonyms": [
    {
      "word": "<同义词>",
      "phonetic": "<IPA 音标>",
      "pos": "<词性>",
      "cn_meaning": "<中文意思>",
      "usage": "<英文用法说明>",
      "examples": [
        {"en": "<例句>", "cn": "<中文翻译>"},
        {"en": "<例句>", "cn": "<中文翻译>"}
      ]
    }
  ],
  "analysis": {
    "quick_compare": [
      {"word": "${word}", "point": "<一句话核心语义>"},
      {"word": "<同义词>", "point": "<一句话核心语义>"}
    ],
    "contrast_examples": [
      {"scenario": "<场景描述>", "sentences": [
        {"word": "${word}", "en": "<例句>", "cn": "<中文翻译>"},
        {"word": "<同义词>", "en": "<例句>", "cn": "<中文翻译>"}
      ]}
    ],
    "exclusive_usage": [
      {"use_only": "${word}", "en": "<只能用 ${word} 的正确句子>", "cn": "<中文翻译>", "wrong": "<换成同义词的错误句子>", "rule": "<为什么>"},
      {"use_only": "<同义词>", "en": "<只能用该同义词的正确句子>", "cn": "<中文翻译>", "wrong": "<换成 ${word} 的错误句子>", "rule": "<为什么>"}
    ],
    "summary": "<一句话记忆口诀/总结>"
  }
}`;
}

// 场景2：多个单词对比
export function buildMultiPrompt(words) {
  const list = words.join('  ');
  return `请辨析以下英语单词（空格分隔）：
${list}

要求：
1. 每个单词分别给出：音标(IPA)、词性、中文意思、英文用法说明、2 个中英对照例句。
2. 给出整体对比：按「中文意思 / 用法 / 差异点」三个维度，把每个词并排列出。
3. 对每个单词，给出只能用它的例句（体现其不可替换性）。
4. 用一句话总结这几个词的根本区别。

只返回如下 JSON（不要任何额外文字）：
{
  "mode": "multi",
  "words": [
    {
      "word": "<单词>",
      "phonetic": "<IPA 音标>",
      "pos": "<词性>",
      "cn_meaning": "<中文意思>",
      "usage": "<英文用法说明>",
      "examples": [
        {"en": "<例句>", "cn": "<中文翻译>"},
        {"en": "<例句>", "cn": "<中文翻译>"}
      ]
    }
  ],
  "analysis": {
    "overall_table": {
      "dimensions": ["中文意思", "用法", "差异点"],
      "rows": [
        {"word": "<单词>", "cells": ["<中文意思>", "<用法>", "<差异点>"]}
      ]
    },
    "exclusive": [
      {"word": "<单词>", "examples": [
        {"en": "<只能用该词的例句>", "cn": "<中文翻译>", "note": "<说明>"}
      ]}
    ],
    "summary": "<一句话总结>"
  }
}`;
}
