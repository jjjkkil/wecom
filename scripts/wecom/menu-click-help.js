#!/usr/bin/env node

// 从 stdin 读取平台注入的事件 envelope（JSON）
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
    // 输入异常时返回可读错误，避免脚本抛异常导致无输出
    process.stdout.write(
      JSON.stringify({
        ok: false,
        action: "reply_text",
        reply: {
          text: "事件脚本解析输入失败，请联系管理员。",
        },
        chainToAgent: true,
      }),
    );
    return;
  }

  const message = payload && typeof payload === "object" ? payload.message ?? {} : {};
  const eventType = String(message.eventType ?? "unknown");
  const eventKey = String(message.eventKey ?? "");
  const fromUser = String(message.fromUser ?? "");

  // 这里给出联调用的回显文本，业务可改为真正逻辑
  const text = [
    "已收到菜单事件",
    `eventType=${eventType}`,
    eventKey ? `eventKey=${eventKey}` : "eventKey=<empty>",
    fromUser ? `fromUser=${fromUser}` : "",
    "\n你可以在 openclaw 配置里把这个 eventKey 路由到具体业务脚本。",
  ]
    .filter(Boolean)
    .join("\n");

  process.stdout.write(
    JSON.stringify({
      ok: true,
      action: "reply_text",
      reply: {
        text,
      },
      chainToAgent: false,
      audit: {
        tags: ["menu", "click", eventType],
      },
    }),
  );
});
