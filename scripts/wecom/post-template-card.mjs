#!/usr/bin/env node

let raw = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  raw += chunk;
});

process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.stdout.write(JSON.stringify({
      ok: false,
      action: "reply_text",
      reply: {
        text: "后处理脚本解析输入失败，请联系管理员。",
      },
      chainToAgent: false,
      error: "invalid input payload",
    }));
    return;
  }

  const message = payload && typeof payload === "object" ? payload.message ?? {} : {};
  const reply = payload && typeof payload === "object" ? payload.reply ?? {} : {};
  const eventType = String(message.eventType ?? "unknown");
  const eventKey = String(message.eventKey ?? "");
  const fromUser = String(message.fromUser ?? "");
  const fallbackToSuccess = reply.fallbackToSuccess === true;
  const fallbackReason = String(reply.reason ?? "");

  if (eventKey.startsWith("AI:")) {
    process.stdout.write(JSON.stringify({
      ok: true,
      action: "none",
      chainToAgent: true,
      audit: {
        tags: ["passive-reply", "post", "chain-ai", eventType],
      },
    }));
    return;
  }

  const lines = [
    "模板卡片事件已进入后处理。",
    fromUser ? `用户: ${fromUser}` : "",
    eventKey ? `事件: ${eventKey}` : "",
    fallbackToSuccess
      ? `回包状态: 已降级为 success (${fallbackReason || "unknown"})`
      : "回包状态: 被动回复已成功发出",
  ].filter(Boolean);

  process.stdout.write(JSON.stringify({
    ok: true,
    action: "reply_text",
    reply: {
      text: lines.join("\n"),
    },
    chainToAgent: false,
    audit: {
      tags: [
        "passive-reply",
        "post",
        fallbackToSuccess ? "fallback-success" : "passive-sent",
        eventType,
      ],
    },
  }));
});