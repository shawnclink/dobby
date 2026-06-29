# ThesisGlow Lite — 英文生词行间翻译

> 逆向工程 ThesisGlow 核心功能：**自动预判生词 + 行间内嵌中文释义**。
> 针对 ADHD 阅读者优化 — 不弹窗、不切页、不打断阅读流。

## ✨ 三大功能

| 功能 | 说明 |
|------|------|
| **Chrome 扩展** | 浏览任意英文网页，悬停段落 → 点 Glow → 生词上方出中文释义 |
| **PDF 上传** | 拖拽英文论文/文章 PDF → 自动提取文本 → 全篇标注 |
| **词汇记忆** | 自动记录你见过的词，标注 3 次后自动跳过（已知词不再标） |

## 🚀 快速开始

```bash
cd ~/thesisglow-lite
python3 server.py
```

### Web App
浏览器打开 `http://localhost:8848`
- 粘贴英文文本 或 拖拽 PDF → 点 **Glow**
- 选词汇水平（Beginner/Intermediate/Advanced）
- 点「📊 词汇记忆」查看词汇库

### Chrome 扩展
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点「加载已解压的扩展程序」
4. 选 `~/thesisglow-lite/extension`
5. 浏览任意英文网页 → 悬停段落 → `✨ Glow`
6. 点扩展图标打开控制面板

## 🏗 项目结构

```
thesisglow-lite/
├── server.py              # Python 后端（stdlib only）
├── index.html             # Web App（PDF + 词汇记忆 + 多水平）
├── extension/             # Chrome 扩展
│   ├── manifest.json      # MV3
│   ├── content.js         # 页面扫描 + 渲染
│   ├── content.css        # 行间翻译样式（ADHD 友好）
│   ├── background.js      # API 代理 + 词汇记忆 + 状态管理
│   ├── popup.html         # 控制面板
│   ├── popup.js           # 面板逻辑
│   └── icons/             # 图标
└── README.md
```

## 🔧 核心原理

```
英文文本（网页/PDF/粘贴）
    ↓
DeepSeek API（System Prompt 定义生词筛选规则）
    ↓
返回 [{word, translation}, ...]
    ↓
词汇记忆过滤（已知词跳过）
    ↓
前端渲染：原文不动，生词上方插入小字中文释义
```

### 生词筛选规则

- ✅ 标注：学术术语、低频长难词、抽象名词、生僻动词
- ❌ 跳过：初高中基础词（you, the, have, people…）
- 🎯 ADHD 优化：少量标注，不密密麻麻堆砌
- 🧠 记忆升级：同一词出现 3 次 → 自动跳过

### 词汇水平

| 级别 | 标注策略 |
|------|---------|
| **Beginner** | 多标词，包括中阶词汇 |
| **Intermediate** | 适中，默认 |
| **Advanced** | 只标真正的低频学术难词 |

### 前端渲染 · ADHD 友好

- 翻译字号更小（10-11px）
- 低饱和度浅色（`#a09080`）
- 默认半透明（opacity 0.45），hover 变清晰
- 无动画、无弹窗、无闪烁、无强制交互

## 📋 自定义

编辑 `server.py` 里的 `SYSTEM_PROMPT` 调整标注策略。

## 📄 License

MIT
