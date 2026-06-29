#!/usr/bin/env python3
"""ThesisGlow Lite — 极简行间翻译服务。

Chrome Extension 后端 + Web App 服务器。
生词预判 + 语境中文释义 + 词汇记忆 + PDF 文本提取。

Usage:
    python3 server.py          # 默认端口 8848
    python3 server.py --port 9999
"""

import json
import re
import sys
import time
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"

# ── DeepSeek API config ──────────────────────────────────
API_KEY = "sk-81f9e3a203ba4ca78b6487602fa7f7be"
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

# ── System Prompt ────────────────────────────────────────
SYSTEM_PROMPT = """你是英文学术文献生词标注工具，处理用户输入的英文段落，严格遵守以下规则：

1. 词汇筛选标准（预判用户不认识的词）
- 优先标记：专业学术术语、低频长难词、学科专有名词、固定学术搭配、生僻动词/抽象名词
- 跳过：基础初高中简单词汇（you, the, have, say, people 等日常通用词）
- 区分 ADHD 用户阅读痛点：少量标注，不密密麻麻堆砌翻译干扰阅读，只挑真正阻碍理解的词

2. 释义输出规则（行间内嵌，不破坏原文语序）
- 每个选中单词，只输出贴合当前句子语境的中文短释义，拒绝长篇词典释义
- 翻译必须适配本句上下文，不照搬通用字典义

3. 输出格式（严格 JSON）
返回一个 JSON 对象，格式如下：
{"annotations": [{"word": "原文单词", "translation": "中文短释义"}]}

按单词在原文中出现顺序排列。每个对象只标注一个单词。不要重复标注同一个单词。
只输出 JSON，不要输出任何其他内容。"""


def build_user_prompt(text: str, known_words: list[str], level: str) -> str:
    """构建包含用户词汇水平的 user prompt。"""
    parts = [text]

    if known_words:
        parts.append(
            f"\n\n---\n用户已知词汇（这些词不要标注）：{', '.join(known_words[:200])}"
        )

    if level == 'beginner':
        parts.append("\n用户是初学者，请多标注一些词（包括中阶词汇）。")
    elif level == 'advanced':
        parts.append("\n用户水平较高，只标注真正的低频学术难词和专业术语。")

    return '\n'.join(parts)


def call_deepseek(text: str, known_words: list[str] | None = None, level: str = "intermediate") -> list[dict]:
    """调用 DeepSeek API，返回标注列表。"""
    known = known_words or []
    user_content = build_user_prompt(text, known, level)

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            content = data["choices"][0]["message"]["content"]
            return parse_response(content)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API 错误 {e.code}: {err[:300]}")
    except Exception as e:
        raise RuntimeError(f"请求失败: {e}")


def parse_response(content: str) -> list[dict]:
    """解析 LLM 返回的 JSON，带容错。"""
    try:
        data = json.loads(content)
        return data.get("annotations", [])
    except json.JSONDecodeError:
        pass

    m = re.search(r"\{[\s\S]*\"annotations\"[\s\S]*\}", content)
    if m:
        try:
            data = json.loads(m.group())
            return data.get("annotations", [])
        except json.JSONDecodeError:
            pass

    raise RuntimeError(f"无法解析 API 返回: {content[:300]}")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html = INDEX.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
        elif self.path == "/api/health":
            self._send_json({"status": "ok", "model": MODEL})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/glow":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            try:
                data = json.loads(body)
                text = data.get("text", "").strip()
                if not text:
                    self._send_json({"error": "文本为空"}, 400)
                    return

                known_words = data.get("known_words", [])
                level = data.get("level", "intermediate")

                print(f"  📖 {len(text)} chars | level={level} | known={len(known_words)} words")
                annotations = call_deepseek(text, known_words, level)
                print(f"  ✅ {len(annotations)} annotations")
                self._send_json({"annotations": annotations})

            except RuntimeError as e:
                print(f"  ❌ {e}")
                self._send_json({"error": str(e)}, 500)
            except Exception as e:
                print(f"  ❌ {e}")
                self._send_json({"error": str(e)}, 500)
        else:
            self._send_json({"error": "not found"}, 404)


def main():
    port = 8848
    if len(sys.argv) > 2 and sys.argv[1] == "--port":
        port = int(sys.argv[2])

    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"🧠 ThesisGlow Lite → http://localhost:{port}")
    print(f"   API:   POST /api/glow")
    print(f"   Health: GET /api/health")
    print(f"   Web:   GET /")
    print(f"   按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 已停止")
        server.server_close()


if __name__ == "__main__":
    main()
