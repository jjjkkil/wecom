let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const eventType = payload?.message?.eventType ?? "unknown";
  const eventKey = payload?.message?.eventKey ?? "";
  const changeType = payload?.message?.changeType ?? "";

  if (eventKey === "PASS_TO_DEFAULT") {
    process.stdout.write(JSON.stringify({
      ok: true,
      action: "none",
      chainToAgent: true,
    }));
    return;
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    action: "reply_text",
    reply: {
      text: `script:${eventType}:${eventKey}:${changeType}`,
    },
    chainToAgent: false,
  }));
});
