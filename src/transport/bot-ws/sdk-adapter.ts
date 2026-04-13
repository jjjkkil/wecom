import crypto from "node:crypto";
import AiBot, {
  generateReqId,
  type BaseMessage,
  type EventMessage,
  type WsFrame,
} from "@wecom/aibot-node-sdk";
import type { WecomAccountRuntime } from "../../app/account-runtime.js";
import {
  registerBotWsPushHandle,
  unregisterBotWsPushHandle,
  getAccountRuntime,
  getBotWsPushHandle,
} from "../../app/index.js";
import { clearWecomMcpAccountCache } from "../../capability/mcp/index.js";
import { toWeComMarkdownV2 } from "../../wecom_msg_adapter/markdown_adapter.js";
import type { ReplyHandle, ReplyPayload, RuntimeLogSink } from "../../types/index.js";
import {
  buildFanoutDeliveryDedupeKey,
  resolveFanoutEnabled,
  resolveFanoutDedupeWindowMs,
  extractMentionedAccountIds,
  buildMentionAliasLookup,
  summarizeTextForLog,
} from "../../shared/mention-fanout-utils.js";
import { mapBotWsFrameToInboundEvent } from "./inbound.js";
import { uploadAndSendBotWsMedia } from "./media.js";
import { createBotWsReplyHandle } from "./reply.js";
import { createBotWsSessionSnapshot } from "./session.js";

const fanoutDedupeSeenAt = new Map<string, number>();

function shouldDispatchFanout(params: { key: string; ttlMs: number; now: number }): boolean {
  const { key, ttlMs, now } = params;
  for (const [existingKey, seenAt] of fanoutDedupeSeenAt.entries()) {
    if (now - seenAt > ttlMs) {
      fanoutDedupeSeenAt.delete(existingKey);
    }
  }
  const previous = fanoutDedupeSeenAt.get(key);
  if (typeof previous === "number" && now - previous <= ttlMs) {
    return false;
  }
  fanoutDedupeSeenAt.set(key, now);
  return true;
}

function createFanoutBotWsPushReplyHandle(params: {
  accountId: string;
  peerId: string;
  sourceFrame: WsFrame<BaseMessage | EventMessage>;
  sourceLog: RuntimeLogSink;
}): ReplyHandle {
  const { accountId, peerId, sourceFrame, sourceLog } = params;
  const deliveredMediaUrls = new Set<string>();
  let latestText = "";

  return {
    context: {
      transport: "bot-ws",
      accountId,
      reqId: sourceFrame.headers.req_id,
      raw: {
        transport: "bot-ws",
        command: sourceFrame.cmd,
        headers: sourceFrame.headers,
        body: sourceFrame.body,
        envelopeType: "ws",
      },
    },
    deliver: async (payload: ReplyPayload, info) => {
      const push = getBotWsPushHandle(accountId);
      if (!push) {
        throw new Error(`fanout target account=${accountId} has no WS push handle`);
      }
      if (!push.isConnected()) {
        throw new Error(`fanout target account=${accountId} WS push handle is disconnected`);
      }

      const incomingText = payload.text?.trim();
      if (incomingText) {
        latestText = incomingText;
      }

      // Suppress non-final text blocks to avoid duplicate active-push messages.
      const finalText = info.kind === "final" ? (incomingText || latestText) : undefined;
      if (finalText) {
        await push.sendMarkdown(peerId, toWeComMarkdownV2(finalText));
      }

      const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])]
        .map((url) => String(url ?? "").trim())
        .filter(Boolean)
        .filter((url) => {
          if (deliveredMediaUrls.has(url)) return false;
          deliveredMediaUrls.add(url);
          return true;
        });

      for (const mediaUrl of mediaUrls) {
        const result = await push.sendMedia({
          chatId: peerId,
          mediaUrl,
          text: finalText,
        });
        if (!result.ok) {
          sourceLog.warn?.(
            `[wecom-ws] fanout push media failed account=${accountId} peer=${peerId} media=${mediaUrl} reason=${result.rejectReason ?? result.error ?? "unknown"}`,
          );
        }
      }
    },
    fail: async () => {},
    markExternalActivity: () => {},
  };
}

export class BotWsSdkAdapter {
  private client?: AiBot.WSClient;
  private readonly ownerId: string;

  constructor(
    private readonly runtime: WecomAccountRuntime,
    private readonly log: RuntimeLogSink,
  ) {
    this.ownerId = `${this.runtime.account.accountId}:ws:${crypto.randomUUID().slice(0, 8)}`;
  }

  start(): void {
    const bot = this.runtime.account.bot;
    if (!bot?.wsConfigured || !bot.ws) {
      throw new Error(`WeCom bot account "${this.runtime.account.accountId}" missing WS config.`);
    }
    this.log.info?.(
      `[wecom-ws] start account=${this.runtime.account.accountId} botId=${bot.ws.botId} wsUrl=default heartbeat=default reconnectInterval=default`,
    );
    const client = new AiBot.WSClient({
      botId: bot.ws.botId,
      secret: bot.ws.secret,
      logger: {
        debug: (message, ...args) =>
          this.log.info?.(`[wecom-ws] ${message} ${args.join(" ")}`.trim()),
        info: (message, ...args) =>
          this.log.info?.(`[wecom-ws] ${message} ${args.join(" ")}`.trim()),
        warn: (message, ...args) =>
          this.log.warn?.(`[wecom-ws] ${message} ${args.join(" ")}`.trim()),
        error: (message, ...args) =>
          this.log.error?.(`[wecom-ws] ${message} ${args.join(" ")}`.trim()),
      },
    });
    this.client = client;
    registerBotWsPushHandle(this.runtime.account.accountId, {
      isConnected: () => client.isConnected,
      replyCommand: async ({ cmd, body, headers }) => {
        const replyHeaders = {
          ...(headers ?? {}),
          req_id: headers?.req_id ?? generateReqId("wecom_ws"),
        };
        const result = await client.reply({ headers: replyHeaders }, body ?? {}, cmd);
        this.runtime.touchTransportSession("bot-ws", {
          ownerId: this.ownerId,
          running: true,
          connected: client.isConnected,
          authenticated: client.isConnected,
          lastOutboundAt: Date.now(),
          lastError: undefined,
        });
        return result as unknown as Record<string, unknown>;
      },
      sendMarkdown: async (chatId, content) => {
        await client.sendMessage(chatId, {
          msgtype: "markdown",
          markdown: { content },
        });
        this.runtime.touchTransportSession("bot-ws", {
          ownerId: this.ownerId,
          running: true,
          connected: client.isConnected,
          authenticated: client.isConnected,
          lastOutboundAt: Date.now(),
          lastError: undefined,
        });
      },
      sendMedia: async ({ chatId, mediaUrl, text, mediaLocalRoots, maxBytes }) => {
        const result = await uploadAndSendBotWsMedia({
          wsClient: client,
          chatId,
          mediaUrl,
          mediaLocalRoots,
          maxBytes,
        });
        if (result.ok && text?.trim()) {
          await client.sendMessage(chatId, {
            msgtype: "markdown",
            markdown: { content: text.trim() },
          });
        }
        this.runtime.touchTransportSession("bot-ws", {
          ownerId: this.ownerId,
          running: true,
          connected: client.isConnected,
          authenticated: client.isConnected,
          lastOutboundAt: Date.now(),
          lastError: result.ok ? undefined : result.error,
        });
        return result;
      },
    });

    client.on("connected", () => {
      this.log.info?.(`[wecom-ws] connected account=${this.runtime.account.accountId}`);
      this.runtime.updateTransportSession(
        createBotWsSessionSnapshot({
          accountId: this.runtime.account.accountId,
          ownerId: this.ownerId,
          connected: true,
          authenticated: false,
        }),
      );
    });

    client.on("authenticated", () => {
      this.log.info?.(`[wecom-ws] authenticated account=${this.runtime.account.accountId}`);
      this.runtime.updateTransportSession(
        createBotWsSessionSnapshot({
          accountId: this.runtime.account.accountId,
          ownerId: this.ownerId,
          connected: true,
          authenticated: true,
        }),
      );
    });

    client.on("disconnected", (reason) => {
      clearWecomMcpAccountCache(this.runtime.account.accountId);
      const normalizedReason = String(reason ?? "").toLowerCase();
      const kicked =
        normalizedReason.includes("kick") ||
        normalizedReason.includes("owner") ||
        normalizedReason.includes("replaced");
      this.log.warn?.(
        `[wecom-ws] disconnected account=${this.runtime.account.accountId} kicked=${String(kicked)} reason=${reason ?? "unknown"}`,
      );
      if (kicked) {
        this.runtime.recordOperationalIssue({
          transport: "bot-ws",
          category: "ws-kicked",
          summary: `ws owner lost: ${reason ?? "unknown"}`,
          error: reason ?? "unknown",
        });
      }
      this.runtime.updateTransportSession(
        createBotWsSessionSnapshot({
          accountId: this.runtime.account.accountId,
          ownerId: this.ownerId,
          running: false,
          connected: false,
          authenticated: false,
          lastDisconnectedAt: Date.now(),
          lastError: reason,
        }),
      );
    });

    client.on("reconnecting", (attempt) => {
      this.log.warn?.(
        `[wecom-ws] reconnecting account=${this.runtime.account.accountId} attempt=${attempt}`,
      );
    });

    client.on("error", (error) => {
      this.log.error?.(
        `[wecom-ws] error account=${this.runtime.account.accountId} message=${error.message}`,
      );
      this.runtime.updateTransportSession(
        createBotWsSessionSnapshot({
          accountId: this.runtime.account.accountId,
          ownerId: this.ownerId,
          running: false,
          connected: client.isConnected,
          authenticated: client.isConnected,
          lastError: error.message,
        }),
      );
    });

    const handleFrame = async (frame: WsFrame<BaseMessage | EventMessage>) => {
      const botAccount = this.runtime.account.bot;
      if (!botAccount) {
        return;
      }
      this.log.info?.(
        `[wecom-ws] frame account=${this.runtime.account.accountId} cmd=${frame.cmd} reqId=${frame.headers.req_id ?? "n/a"}`,
      );
      this.runtime.touchTransportSession("bot-ws", {
        ownerId: this.ownerId,
        running: true,
        connected: client.isConnected,
        authenticated: client.isConnected,
        lastInboundAt: Date.now(),
      });
      const event = mapBotWsFrameToInboundEvent({
        account: botAccount,
        frame,
      });
      const replyHandle = createBotWsReplyHandle({
        client,
        frame,
        accountId: this.runtime.account.accountId,
        inboundKind: event.inboundKind,
        placeholderContent: botAccount.config.streamPlaceholderContent,
        autoSendPlaceholder:
          event.inboundKind === "text" ||
          event.inboundKind === "image" ||
          event.inboundKind === "file" ||
          event.inboundKind === "voice" ||
          event.inboundKind === "mixed",
        onDeliver: () => {
          this.runtime.touchTransportSession("bot-ws", {
            ownerId: this.ownerId,
            running: true,
            connected: client.isConnected,
            authenticated: client.isConnected,
            lastOutboundAt: Date.now(),
          });
        },
        onFail: (error) => {
          this.runtime.touchTransportSession("bot-ws", {
            ownerId: this.ownerId,
            running: client.isConnected,
            connected: client.isConnected,
            authenticated: client.isConnected,
            lastError: error instanceof Error ? error.message : String(error),
          });
        },
      });

      const staticWelcomeText =
        event.inboundKind === "welcome" ? botAccount.config.welcomeText?.trim() : undefined;
      if (staticWelcomeText) {
        this.log.info?.(
          `[wecom-ws] static welcome reply account=${this.runtime.account.accountId} messageId=${event.messageId} peer=${event.conversation.peerKind}:${event.conversation.peerId} len=${staticWelcomeText.length}`,
        );
        await replyHandle.deliver(
          {
            text: staticWelcomeText,
          },
          { kind: "final" },
        );
        this.log.info?.(
          `[wecom-ws] static welcome delivered account=${this.runtime.account.accountId} messageId=${event.messageId}`,
        );
        return;
      }

      // Handle group mention fanout for WS transport
      let fanoutDispatchedCount = 0;
      if (
        resolveFanoutEnabled(this.runtime.cfg) &&
        event.conversation.peerKind === "group" &&
        event.inboundKind === "text"
      ) {
        const rawText = String(event.text ?? "");
        const mentionLookup = buildMentionAliasLookup(this.runtime.cfg);
        const allAccountIds = Array.from(new Set(mentionLookup.values()));
        const mentionedAccountIds = extractMentionedAccountIds({ text: rawText, aliasToAccountId: mentionLookup })
          .filter((accountId) => accountId !== this.runtime.account.accountId);

        this.log.info?.(
          `[wecom-ws] fanout: enabled=true sourceAccount=${this.runtime.account.accountId} groupChatId=${event.conversation.peerId} msgid=${String(event.messageId ?? "")} textPreview=${JSON.stringify(
            summarizeTextForLog(rawText),
          )} candidates=[${allAccountIds.join(",")}] extracted=[${mentionedAccountIds.join(",")}]`,
        );

        if (mentionedAccountIds.length === 0) {
          this.log.info?.(
            `[wecom-ws] fanout: no target accounts extracted from text; skip fanout`,
          );
        }

        const fanoutDedupeWindowMs = resolveFanoutDedupeWindowMs(this.runtime.cfg);

        for (const accountId of mentionedAccountIds) {
          const dedupeKey = buildFanoutDeliveryDedupeKey({
            sourceAccountId: this.runtime.account.accountId,
            targetAccountId: accountId,
            peerId: event.conversation.peerId,
            senderId: event.conversation.senderId,
            messageId: event.messageId,
            reqId: frame.headers.req_id,
          });
          const shouldDispatch = shouldDispatchFanout({
            key: dedupeKey,
            ttlMs: fanoutDedupeWindowMs,
            now: Date.now(),
          });
          if (!shouldDispatch) {
            this.log.info?.(
              `[wecom-ws] fanout dedupe hit sourceAccount=${this.runtime.account.accountId} targetAccount=${accountId} messageId=${String(event.messageId ?? "")} reqId=${String(frame.headers.req_id ?? "")}`,
            );
            continue;
          }

          const targetRuntime = getAccountRuntime(accountId);
          const targetBot = targetRuntime?.account.bot;
          if (!targetRuntime || !targetBot?.configured || !targetBot.wsConfigured) {
            this.log.info?.(
              `[wecom-ws] fanout: skip account=${accountId} reason=runtime_or_ws_not_ready`,
            );
            continue;
          }

          // Create a modified event for fanout target, with annotated messageId
          const fanoutMessageId = event.messageId
            ? `${String(event.messageId)}#fanout:${accountId}`
            : `fanout:${accountId}:${generateReqId("msg")}`;

          const fanoutEvent = {
            ...event,
            accountId,
            messageId: fanoutMessageId,
          };

          // Fanout replies must use target account's own WS push handle,
          // not the source frame req_id, otherwise identity and routing are mixed.
          const fanoutReplyHandle = createFanoutBotWsPushReplyHandle({
            accountId,
            peerId: event.conversation.peerId,
            sourceFrame: frame,
            sourceLog: this.log,
          });

          // Dispatch to fanout target
          targetRuntime
            .handleEvent(fanoutEvent, fanoutReplyHandle)
            .catch((err) => {
              this.log.error?.(
                `[wecom-ws] fanout dispatch failed account=${accountId} error=${err instanceof Error ? err.message : String(err)}`,
              );
            });

          this.log.info?.(
            `[wecom-ws] fanout: sourceAccount=${this.runtime.account.accountId} -> account=${accountId} messageId=${fanoutMessageId}`,
          );
          fanoutDispatchedCount += 1;
        }

        this.log.info?.(
          `[wecom-ws] fanout: completed sourceAccount=${this.runtime.account.accountId} dispatched=${fanoutDispatchedCount}`,
        );
      } else if (event.conversation.peerKind === "group" && event.inboundKind === "text") {
        this.log.info?.(
          `[wecom-ws] fanout: bypassed enabled=${String(resolveFanoutEnabled(this.runtime.cfg))} sourceAccount=${this.runtime.account.accountId}`,
        );
      }

      await this.runtime.handleEvent(event, replyHandle);
    };

    const runHandleFrame = (frame: WsFrame<BaseMessage | EventMessage>) => {
      void handleFrame(frame).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.log.error?.(
          `[wecom-ws] frame handler failed account=${this.runtime.account.accountId} reqId=${frame.headers?.req_id ?? "n/a"} message=${message}`,
        );
        this.runtime.recordOperationalIssue({
          transport: "bot-ws",
          category: "runtime-error",
          messageId: frame.body?.msgid,
          raw: {
            transport: "bot-ws",
            command: frame.cmd,
            headers: frame.headers,
            body: frame.body,
            envelopeType: "ws",
          },
          summary: `bot-ws frame handler crashed reqId=${frame.headers?.req_id ?? "n/a"}`,
          error: message,
        });
        this.runtime.touchTransportSession("bot-ws", {
          ownerId: this.ownerId,
          running: client.isConnected,
          connected: client.isConnected,
          authenticated: client.isConnected,
          lastError: message,
        });
      });
    };

    client.on("message", (frame) => {
      runHandleFrame(frame);
    });
    client.on("event", (frame) => {
      runHandleFrame(frame);
    });

    client.connect();
  }

  stop(): void {
    this.log.info?.(`[wecom-ws] stop account=${this.runtime.account.accountId}`);
    clearWecomMcpAccountCache(this.runtime.account.accountId);
    unregisterBotWsPushHandle(this.runtime.account.accountId);
    this.runtime.updateTransportSession(
      createBotWsSessionSnapshot({
        accountId: this.runtime.account.accountId,
        ownerId: this.ownerId,
        running: false,
        connected: false,
        authenticated: false,
        lastDisconnectedAt: Date.now(),
      }),
    );
    this.client?.disconnect();
  }
}
