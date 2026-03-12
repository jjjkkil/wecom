import type { BaseMessage, EventMessage, WsFrame } from "@wecom/aibot-node-sdk";

import type { ResolvedBotAccount, UnifiedInboundEvent, WecomInboundKind } from "../../types/index.js";

function resolveInboundKind(message: BaseMessage | EventMessage): WecomInboundKind {
  if (message.msgtype === "event") {
    const eventType = String((message as EventMessage).event?.eventtype ?? "").trim();
    if (eventType === "enter_chat") return "welcome";
    if (eventType === "template_card_event") return "template-card-event";
    return "event";
  }
  switch (message.msgtype) {
    case "image":
      return "image";
    case "file":
      return "file";
    case "voice":
      return "voice";
    case "mixed":
      return "mixed";
    default:
      return "text";
  }
}

function resolveEventText(message: BaseMessage | EventMessage, account: ResolvedBotAccount): string {
  if (message.msgtype === "text") {
    return message.text?.content ?? "";
  }
  if (message.msgtype === "voice") {
    return message.voice?.content ?? "";
  }
  if (message.msgtype === "mixed") {
    return (message.mixed?.msg_item ?? [])
      .map((item: { msgtype: string; text?: { content?: string } }) =>
        item.msgtype === "text" ? item.text?.content ?? "" : "[image]",
      )
      .filter(Boolean)
      .join("\n");
  }
  if (message.msgtype === "image") {
    return "[image]";
  }
  if (message.msgtype === "file") {
    return "[file]";
  }
  const event = message as EventMessage;
  if (event.event?.eventtype === "enter_chat" && account.config.welcomeText) {
    return account.config.welcomeText;
  }
  return `[event:${String(event.event?.eventtype ?? "unknown")}]`;
}

export function mapBotWsFrameToInboundEvent(params: {
  account: ResolvedBotAccount;
  frame: WsFrame<BaseMessage | EventMessage>;
}): UnifiedInboundEvent {
  const { account, frame } = params;
  const body = frame.body;
  if (!body) {
    throw new Error("Bot WS frame body is required");
  }
  const peerKind = body.chattype === "group" ? "group" : "direct";
  const senderId = body.from?.userid ?? "unknown";
  const peerId = peerKind === "group" ? body.chatid ?? senderId : senderId;
  const inboundKind = resolveInboundKind(body);

  return {
    accountId: account.accountId,
    capability: "bot",
    transport: "bot-ws",
    inboundKind,
    messageId: body.msgid,
    conversation: {
      accountId: account.accountId,
      peerKind,
      peerId,
      senderId,
    },
    senderName: senderId,
    text: resolveEventText(body, account),
    timestamp: typeof body.create_time === "number" ? body.create_time : Date.now(),
    raw: {
      transport: "bot-ws",
      command: frame.cmd,
      headers: frame.headers,
      body,
      envelopeType: "ws",
    },
    replyContext: {
      transport: "bot-ws",
      accountId: account.accountId,
      reqId: frame.headers.req_id,
      raw: {
        transport: "bot-ws",
        command: frame.cmd,
        headers: frame.headers,
        body,
        envelopeType: "ws",
      },
    },
    attachments: body.msgtype === "image"
      ? [{ name: "image", remoteUrl: body.image?.url, aesKey: (body as any).image?.aeskey }]
      : body.msgtype === "file"
        ? [{ name: "file", remoteUrl: body.file?.url, aesKey: (body as any).file?.aeskey }]
        : undefined,
  };
}
