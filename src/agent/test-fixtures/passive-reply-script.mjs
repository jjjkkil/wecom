let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const eventKey = payload?.message?.eventKey ?? "";

  if (eventKey === "TIMEOUT") {
    setTimeout(() => {
      process.stdout.write(JSON.stringify({
        ok: true,
        responseMode: "passive_reply",
        replyMessage: "<xml><Content><![CDATA[late]]></Content></xml>",
      }));
    }, 100);
    return;
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    responseMode: "passive_reply",
    replyMessage: "<xml><Content><![CDATA[ok]]></Content></xml>",
    skipPostReplyHandler: eventKey === "SKIP_POST",
  }));
});