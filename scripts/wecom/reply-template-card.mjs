#!/usr/bin/env node

let raw = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  raw += chunk;
});

function cdata(value) {
  return `<![CDATA[${String(value ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function buildTextReplyXml({ toUser, fromUser, createTime, content }) {
  return [
    "<xml>",
    `  <ToUserName>${cdata(toUser)}</ToUserName>`,
    `  <FromUserName>${cdata(fromUser)}</FromUserName>`,
    `  <CreateTime>${createTime}</CreateTime>`,
    "  <MsgType><![CDATA[text]]></MsgType>",
    `  <Content>${cdata(content)}</Content>`,
    "</xml>",
  ].join("\n");
}

function buildUpdateButtonXml({ toUser, fromUser, createTime, replaceName }) {
  return [
    "<xml>",
    `  <ToUserName>${cdata(toUser)}</ToUserName>`,
    `  <FromUserName>${cdata(fromUser)}</FromUserName>`,
    `  <CreateTime>${createTime}</CreateTime>`,
    "  <MsgType><![CDATA[update_button]]></MsgType>",
    "  <Button>",
    `    <ReplaceName>${cdata(replaceName)}</ReplaceName>`,
    "  </Button>",
    "</xml>",
  ].join("\n");
}

process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.stdout.write(JSON.stringify({
      ok: false,
      responseMode: "passive_reply",
      error: "invalid input payload",
    }));
    return;
  }

  const message = payload && typeof payload === "object" ? payload.message ?? {} : {};
  const eventType = String(message.eventType ?? "");
  const eventKey = String(message.eventKey ?? "");
  const fromUser = String(message.fromUser ?? "");
  const corpId = String(message.toUser ?? "");
  const createTime = Math.floor(Date.now() / 1000);

  const skipPostReplyHandler = eventKey.startsWith("NO_POST:");

  const replyMessage =
    eventType === "template_card_event" && fromUser && corpId
      ? buildUpdateButtonXml({
          toUser: fromUser,
          fromUser: corpId,
          createTime,
          replaceName: eventKey.startsWith("DONE:") ? "已完成" : "已提交，处理中",
        })
      : buildTextReplyXml({
          toUser: fromUser || "unknown-user",
          fromUser: corpId || "wecom-app",
          createTime,
          content: eventKey ? `已收到事件 ${eventKey}，正在处理中。` : "已收到事件，正在处理中。",
        });

  process.stdout.write(JSON.stringify({
    ok: true,
    responseMode: "passive_reply",
    replyMessage,
    skipPostReplyHandler,
    audit: {
      tags: ["passive-reply", "template-card", eventType || "unknown"],
    },
  }));
});