import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleAgentWebhook } from "./handler.js";
import type { ResolvedAgentAccount, WecomAgentInboundMessage } from "../types/index.js";
import type { WecomRuntimeAuditEvent } from "../types/runtime-context.js";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import * as agentClient from "../transport/agent-api/client.js";

function createMockRequest(url = "/plugins/wecom/agent/default"): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = "POST";
  req.url = url;
  req.push(null);
  return req;
}

function createMockResponse(): ServerResponse & {
  _getData: () => string;
  _getStatusCode: () => number;
} {
  const req = new IncomingMessage(new Socket());
  const res = new ServerResponse(req);
  let data = "";
  res.write = (chunk: any) => {
    data += String(chunk);
    return true;
  };
  res.end = (chunk: any) => {
    if (chunk) data += String(chunk);
    return res;
  };
  (res as any)._getData = () => data;
  (res as any)._getStatusCode = () => res.statusCode;
  return res as any;
}

function createAgent(
  eventKey: string,
  allowSkipPostReplyHandler = true,
  options?: { upstreamCorpId?: string },
): ResolvedAgentAccount {
  const fixturesRoot = path.resolve("src/agent/test-fixtures");
  const upstreamCorpId = options?.upstreamCorpId;
  return {
    accountId: "default",
    configured: true,
    callbackConfigured: true,
    apiConfigured: true,
    corpId: "corp-1",
    corpSecret: "secret",
    agentId: 1001,
    token: "token",
    encodingAESKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    eventEnabled: true,
    allowedEventTypes: ["template_card_event"],
    config: {
      corpId: "corp-1",
      corpSecret: "secret",
      agentId: 1001,
      token: "token",
      encodingAESKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      eventRouting: {
        unmatchedAction: "ignore",
        routes: [
          {
            id: `route-${eventKey}`,
            when: { eventType: "template_card_event" },
            replyHandler: {
              type: "node_script",
              entry: path.resolve("src/agent/test-fixtures/passive-reply-script.mjs"),
              timeoutMs: eventKey === "TIMEOUT" ? 10 : 1000,
              responseMode: "passive_reply",
              allowSkipPostReplyHandler,
            },
            postReplyHandler: {
              enabled: true,
              type: "node_script",
              entry: path.resolve("src/agent/test-fixtures/reply-event-script.mjs"),
              timeoutMs: 1000,
            },
          },
        ],
      },
      scriptRuntime: {
        enabled: true,
        allowPaths: [fixturesRoot],
        nodeCommand: process.execPath,
      },
      upstreamCorps: upstreamCorpId
        ? {
            [upstreamCorpId]: {
              corpId: upstreamCorpId,
              agentId: 2001,
            },
          }
        : undefined,
    },
  };
}

function createParsedEvent(eventKey: string, toUserName = "corp-1"): WecomAgentInboundMessage {
  return {
    ToUserName: toUserName,
    FromUserName: "zhangsan",
    MsgType: "event",
    Event: "template_card_event",
    EventKey: eventKey,
    AgentID: 1001,
    CreateTime: 1710000000,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleAgentWebhook passive reply", () => {
  it("skips postReplyHandler when replyHandler requests skip and config allows it", async () => {
    const sendTextSpy = vi.spyOn(agentClient, "sendAgentApiText").mockResolvedValue(undefined);
    const req = createMockRequest();
    const res = createMockResponse();

    const handled = await handleAgentWebhook({
      req,
      res,
      verifiedPost: {
        timestamp: "1710000000",
        nonce: "nonce-1",
        signature: "sig-1",
        encrypted: "encrypted",
        decrypted: "<xml/>",
        parsed: createParsedEvent("SKIP_POST"),
      },
      agent: createAgent("SKIP_POST", true),
      config: {} as OpenClawConfig,
      core: {} as any,
      auditSink: (_event: WecomRuntimeAuditEvent) => {},
    });

    expect(handled).toBe(true);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toContain("<xml>");
    expect(res._getData()).toContain("<Encrypt>");
    expect(sendTextSpy).not.toHaveBeenCalled();
  });

  it("ignores skipPostReplyHandler when config disallows it", async () => {
    const sendTextSpy = vi.spyOn(agentClient, "sendAgentApiText").mockResolvedValue(undefined);
    const req = createMockRequest();
    const res = createMockResponse();

    await handleAgentWebhook({
      req,
      res,
      verifiedPost: {
        timestamp: "1710000001",
        nonce: "nonce-2",
        signature: "sig-2",
        encrypted: "encrypted",
        decrypted: "<xml/>",
        parsed: createParsedEvent("SKIP_POST"),
      },
      agent: createAgent("SKIP_POST", false),
      config: {} as OpenClawConfig,
      core: {} as any,
      auditSink: (_event: WecomRuntimeAuditEvent) => {},
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toContain("<xml>");
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(sendTextSpy.mock.calls[0]?.[0]?.text).toContain("script:template_card_event:SKIP_POST:");
  });

  it("falls back to success and still runs postReplyHandler on reply timeout", async () => {
    const sendTextSpy = vi.spyOn(agentClient, "sendAgentApiText").mockResolvedValue(undefined);
    const req = createMockRequest();
    const res = createMockResponse();

    await handleAgentWebhook({
      req,
      res,
      verifiedPost: {
        timestamp: "1710000002",
        nonce: "nonce-3",
        signature: "sig-3",
        encrypted: "encrypted",
        decrypted: "<xml/>",
        parsed: createParsedEvent("TIMEOUT"),
      },
      agent: createAgent("TIMEOUT", true),
      config: {} as OpenClawConfig,
      core: {} as any,
      auditSink: (_event: WecomRuntimeAuditEvent) => {},
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toBe("success");
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(sendTextSpy.mock.calls[0]?.[0]?.text).toContain("script:template_card_event:TIMEOUT:");
  });

  it("delivers routed reply text through upstream api for upstream users", async () => {
    const upstreamCorpId = "wp-upstream-1";
    const sendTextSpy = vi.spyOn(agentClient, "sendAgentApiText").mockResolvedValue(undefined);
    const sendUpstreamSpy = vi.spyOn(agentClient, "sendUpstreamAgentApiText").mockResolvedValue(undefined);
    const req = createMockRequest();
    const res = createMockResponse();

    await handleAgentWebhook({
      req,
      res,
      verifiedPost: {
        timestamp: "1710000003",
        nonce: "nonce-4",
        signature: "sig-4",
        encrypted: "encrypted",
        decrypted: "<xml/>",
        parsed: createParsedEvent("SKIP_POST", upstreamCorpId),
      },
      agent: createAgent("SKIP_POST", false, { upstreamCorpId }),
      config: {} as OpenClawConfig,
      core: {} as any,
      auditSink: (_event: WecomRuntimeAuditEvent) => {},
    });

    expect(res._getStatusCode()).toBe(200);
    expect(sendUpstreamSpy).toHaveBeenCalledTimes(1);
    expect(sendUpstreamSpy.mock.calls[0]?.[0]?.upstreamAgent.corpId).toBe(upstreamCorpId);
    expect(sendTextSpy).not.toHaveBeenCalled();
  });
});