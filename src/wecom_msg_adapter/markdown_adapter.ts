/**
 * 将较完整的 Markdown 降级转换为更适合企业微信 markdown_v2 的子集。
 *
 * 保守策略：
 * - 保留：标题、粗体、斜体、引用、链接、行内代码、普通列表、表格
 * - 降级：代码块、图片、任务列表、分隔线、HTML、脚注、复杂语法
 * - 清理：多余空行、非法控制字符、过深嵌套
 */
export function toWeComMarkdownV2(markdown: unknown, maxLength = 4096): string {
  if (!markdown) return "";

  let text = String(markdown).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const extracted = extractInlineCodeSpans(text);
  text = extracted.text;
  const inlineCodeStore = extracted.store;

  text = convertFencedCodeBlocks(text);
  text = convertIndentedCodeBlocks(text);
  text = convertImages(text);
  text = convertTaskLists(text);
  text = convertThematicBreaks(text);
  text = stripHtml(text);
  text = removeFootnotes(text);
  text = removeUnfriendlyExtensions(text);
  text = flattenDeepNesting(text);
  text = normalizeTables(text);
  text = restoreInlineCodeSpans(text, inlineCodeStore);
  text = cleanupWhitespace(text);

  if (maxLength != null && text.length > maxLength) {
    text = truncateSafely(text, maxLength);
  }

  return text;
}

const INLINE_CODE_PREFIX = "\uFFF0INLINECODE";
const INLINE_CODE_SUFFIX = "\uFFF1";

function extractInlineCodeSpans(text: string): { text: string; store: string[] } {
  const store: string[] = [];
  const replaced = text.replace(/`([^`\n]+?)`/g, (_, content: string) => {
    const idx = store.length;
    store.push(content);
    return `${INLINE_CODE_PREFIX}${idx}${INLINE_CODE_SUFFIX}`;
  });
  return { text: replaced, store };
}

function restoreInlineCodeSpans(text: string, store: string[]): string {
  const re = new RegExp(`${INLINE_CODE_PREFIX}(\\d+)${INLINE_CODE_SUFFIX}`, "g");
  return text.replace(re, (_, idxStr: string) => {
    const idx = Number(idxStr);
    const content = idx >= 0 && idx < store.length ? store[idx] : "";
    return `\`${content}\``;
  });
}

function convertFencedCodeBlocks(text: string): string {
  return text.replace(/```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g, (_, lang: string, code: string) => {
    const safeLang = (lang || "").trim();
    const safeCode = String(code || "").replace(/^\n+|\n+$/g, "");
    if (!safeCode.trim()) return "";

    const title = safeLang ? `代码（${safeLang}）：` : "代码：";
    return `\n${title}\n${safeCode}\n`;
  });
}

function convertIndentedCodeBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (!buffer.length) return;
    const block = buffer
      .map(line => (line.startsWith("    ") ? line.slice(4) : line))
      .join("\n")
      .replace(/\s+$/g, "");

    if (block) {
      out.push("代码：");
      out.push(...block.split("\n"));
    }
    buffer = [];
  };

  for (const line of lines) {
    if (/^    \S/.test(line)) {
      buffer.push(line);
    } else {
      flushBuffer();
      out.push(line);
    }
  }

  flushBuffer();
  return out.join("\n");
}

function convertImages(text: string): string {
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
    const safeAlt = (alt || "").trim() || "图片";
    const safeUrl = (url || "").trim();
    return `[图片：${safeAlt}](${safeUrl})`;
  });

  text = text.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (_, alt: string) => {
    const safeAlt = (alt || "").trim() || "图片";
    return `图片：${safeAlt}`;
  });

  return text;
}

function convertTaskLists(text: string): string {
  text = text.replace(/^(\s*[-*+]\s+)\[x\]\s+/gim, "✅ ");
  text = text.replace(/^(\s*[-*+]\s+)\[\s\]\s+/gm, "⬜ ");
  return text;
}

function convertThematicBreaks(text: string): string {
  return text.replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, "────────");
}

function stripHtml(text: string): string {
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p\s*>/gi, "\n");
  text = text.replace(/<p\b[^>]*>/gi, "");

  const simpleTags = [
    "div", "span", "b", "strong", "i", "em", "u",
    "font", "small", "big", "section", "article",
    "header", "footer", "main",
  ];

  for (const tag of simpleTags) {
    const re = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
    text = text.replace(re, "");
  }

  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);

  return text;
}

function decodeHtmlEntities(text: string): string {
  const map: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " ",
  };

  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, m => map[m] ?? m);
}

function removeFootnotes(text: string): string {
  text = text.replace(/^\[\^[^\]]+\]:\s+.*(?:\n(?: {2,}|\t).*)*/gm, "");
  text = text.replace(/\[\^[^\]]+\]/g, "[注]");
  return text;
}

function removeUnfriendlyExtensions(text: string): string {
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/==(.*?)==/g, "$1");
  text = text.replace(/(?<!~)~([^~\n]+)~(?!~)/g, "$1");
  text = text.replace(/\^([^^\n]+)\^/g, "$1");

  text = text.replace(
    /```(?:mermaid|math|latex|tex|graphviz|plantuml)\n([\s\S]*?)```/gi,
    "\n内容略（不支持的扩展块）\n",
  );

  return text;
}

function flattenDeepNesting(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let line of lines) {
    if (/^\s{4,}[-*+]\s+/.test(line)) {
      line = line.replace(/^\s+/, "  ");
    }

    if (/^\s*(>\s*){2,}/.test(line)) {
      const content = line.replace(/^\s*(>\s*)+/, "");
      line = `> ${content}`;
    }

    out.push(line);
  }

  return out.join("\n");
}

function normalizeTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (looksLikeTableRow(lines[i]!)) {
      const tableBlock = [lines[i]!];
      let j = i + 1;

      while (j < lines.length && looksLikeTableRow(lines[j]!)) {
        tableBlock.push(lines[j]!);
        j += 1;
      }

      out.push(...normalizeTableBlock(tableBlock));
      i = j;
    } else {
      out.push(lines[i]!);
      i += 1;
    }
  }

  return out.join("\n");
}

function looksLikeTableRow(line: string): boolean {
  const stripped = String(line).trim();
  if (!stripped.includes("|")) return false;
  return (stripped.match(/\|/g) || []).length >= 2;
}

function normalizeTableBlock(lines: string[]): string[] {
  return lines.map(line => {
    const raw = String(line).trim();
    if (!raw) return line;

    let parts = raw.split("|").map(p => p.trim());
    let left = "";
    let right = "";

    if (raw.startsWith("|")) {
      left = "| ";
      parts = parts.slice(1);
    }

    if (raw.endsWith("|")) {
      parts = parts.slice(0, -1);
      right = " |";
    }

    return left + parts.join(" | ") + right;
  });
}

function cleanupWhitespace(text: string): string {
  const lines = text.split("\n").map(line => {
    let s = line.replace(/[ \t]+$/g, "");
    s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    return s;
  });

  text = lines.join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function truncateSafely(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const suffix = "\n\n（内容过长，已截断）";
  const allowed = maxLength - suffix.length;
  if (allowed <= 0) return text.slice(0, maxLength);

  let truncated = text.slice(0, allowed);
  const cut = truncated.lastIndexOf("\n");
  if (cut > maxLength * 0.7) {
    truncated = truncated.slice(0, cut);
  }

  return truncated.replace(/\s+$/g, "") + suffix;
}
