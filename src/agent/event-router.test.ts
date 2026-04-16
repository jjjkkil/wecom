import path from "node:path";
import { describe, expect, it } from "vitest";

import { routeAgentInboundEvent } from "./event-router.js";
import type { ResolvedAgentAccount, WecomAgentInboundMessage } from "../types/index.js";
import type { WecomRuntimeAuditEvent } from "../types/runtime-context.js";

function createAgent(overrides?: Partial<ResolvedAgentAccount>): ResolvedAgentAccount {
  return {
    accountId: "default",
    configured: true,
    callbackConfigured: true,
    apiConfigured: true,
    corpId: "corp-1",
    corpSecret: "secret",
    agentId: 1001,
    token: "token",
    encodingAESKey: "aes",
    eventEnabled: true,
    allowedEventTypes: ["click", "change_contact"],
    config: {
      corpId: "corp-1",
      corpSecret: "secret",
      agentId: 1001,
      token: "token",
      encodingAESKey: "aes",
    },
    ...overrides,
  };
}

describe("routeAgentInboundEvent", () => {
  it("ignores unmatched events when unmatchedAction is ignore", async () => {
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          unmatchedAction: "ignore",
          routes: [],
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: { MsgType: "event", Event: "click", EventKey: "MENU_X" },
    });

    expect(result.handled).toBe(true);
    expect(result.chainToAgent).toBe(false);
    expect(result.reason).toBe("unmatched_event_ignored");
  });

  it("proxies unmatched events to agent when unmatchedAction is forwardToAgent", async () => {
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          unmatchedAction: "forwardToAgent",
          routes: [],
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: { MsgType: "event", Event: "click", EventKey: "MENU_X" },
    });

    expect(result.handled).toBe(false);
    expect(result.chainToAgent).toBe(true);
  });

  it("matches builtin echo routes using eventKey", async () => {
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "menu-help",
              when: { eventType: "click", eventKey: "MENU_HELP" },
              handler: { type: "builtin", name: "echo" },
            },
          ],
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: { MsgType: "event", Event: "click", EventKey: "MENU_HELP" },
    });

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("event=click");
    expect(result.replyText).toContain("eventKey=MENU_HELP");
    expect(result.matchedRouteId).toBe("menu-help");
  });

  it("matches change_contact routes using changeType", async () => {
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "contact-create-user",
              when: { eventType: "change_contact", changeType: "create_user" },
              handler: { type: "builtin", name: "echo" },
            },
          ],
        },
      },
    });

    const msg: WecomAgentInboundMessage = {
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "create_user",
    };
    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "change_contact",
      fromUser: "sys",
      msg,
    });

    expect(result.handled).toBe(true);
    expect(result.replyText).toContain("changeType=create_user");
  });

  it("passes full event params to node scripts", async () => {
    const fixturePath = path.resolve("src/agent/test-fixtures/reply-event-script.mjs");
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "script-click",
              when: { eventType: "click", eventKeyPrefix: "MENU_" },
              handler: { type: "node_script", entry: fixturePath },
            },
          ],
        },
        scriptRuntime: {
          enabled: true,
          allowPaths: [path.resolve("src/agent/test-fixtures")],
          nodeCommand: process.execPath,
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: {
        ToUserName: "corp-1",
        FromUserName: "zhangsan",
        MsgType: "event",
        Event: "click",
        EventKey: "MENU_HELP",
        AgentID: 1001,
      },
    });

    expect(result.handled).toBe(true);
    expect(result.replyText).toBe("script:click:MENU_HELP:");
  });

  it("supports scripts that explicitly continue the default pipeline", async () => {
    const fixturePath = path.resolve("src/agent/test-fixtures/reply-event-script.mjs");
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "script-click-pass",
              when: { eventType: "click", eventKey: "PASS_TO_DEFAULT" },
              handler: { type: "node_script", entry: fixturePath },
            },
          ],
        },
        scriptRuntime: {
          enabled: true,
          allowPaths: [path.resolve("src/agent/test-fixtures")],
          nodeCommand: process.execPath,
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: {
        MsgType: "event",
        Event: "click",
        EventKey: "PASS_TO_DEFAULT",
      },
    });

    expect(result.handled).toBe(true);
    expect(result.chainToAgent).toBe(true);
    expect(result.replyText).toBeUndefined();
  });

  it("passes full event params to python scripts", async () => {
    const fixturePath = path.resolve("src/agent/test-fixtures/reply-event-script.py");
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "script-python-click",
              when: { eventType: "click", eventKey: "MENU_PY" },
              handler: { type: "python_script", entry: fixturePath },
            },
          ],
        },
        scriptRuntime: {
          enabled: true,
          allowPaths: [path.resolve("src/agent/test-fixtures")],
          pythonCommand: "python3",
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: {
        MsgType: "event",
        Event: "click",
        EventKey: "MENU_PY",
      },
    });

    expect(result.handled).toBe(true);
    expect(result.replyText).toBe("python:click:MENU_PY:");
  });

  it("records audit events for successful script execution", async () => {
    const fixturePath = path.resolve("src/agent/test-fixtures/reply-event-script.mjs");
    const auditEvents: WecomRuntimeAuditEvent[] = [];
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "script-audit-success",
              when: { eventType: "click", eventKey: "MENU_AUDIT" },
              handler: { type: "node_script", entry: fixturePath },
            },
          ],
        },
        scriptRuntime: {
          enabled: true,
          allowPaths: [path.resolve("src/agent/test-fixtures")],
          nodeCommand: process.execPath,
        },
      },
    });

    await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: {
        MsgType: "event",
        Event: "click",
        EventKey: "MENU_AUDIT",
      },
      auditSink: (event) => auditEvents.push(event),
    });

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.category).toBe("inbound");
    expect(auditEvents[0]?.summary).toContain("event route script ok");
  });

  it("captures invalid script output as a routed error and audits it", async () => {
    const fixturePath = path.resolve("src/agent/test-fixtures/invalid-json-script.mjs");
    const auditEvents: WecomRuntimeAuditEvent[] = [];
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          routes: [
            {
              id: "script-invalid-json",
              when: { eventType: "click", eventKey: "MENU_BAD_JSON" },
              handler: { type: "node_script", entry: fixturePath },
            },
          ],
        },
        scriptRuntime: {
          enabled: true,
          allowPaths: [path.resolve("src/agent/test-fixtures")],
          nodeCommand: process.execPath,
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: {
        MsgType: "event",
        Event: "click",
        EventKey: "MENU_BAD_JSON",
      },
      auditSink: (event) => auditEvents.push(event),
    });

    expect(result.handled).toBe(true);
    expect(result.chainToAgent).toBe(false);
    expect(result.reason).toBe("script_node_script_error");
    expect(result.error).toContain("not valid JSON");
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.category).toBe("runtime-error");
  });

  it("treats invalid eventKeyPattern as non-match instead of throwing", async () => {
    const auditEvents: WecomRuntimeAuditEvent[] = [];
    const agent = createAgent({
      config: {
        corpId: "corp-1",
        corpSecret: "secret",
        agentId: 1001,
        token: "token",
        encodingAESKey: "aes",
        eventRouting: {
          unmatchedAction: "ignore",
          routes: [
            {
              id: "invalid-pattern",
              when: { eventType: "click", eventKeyPattern: "(*" },
              handler: { type: "builtin", name: "echo" },
            },
          ],
        },
      },
    });

    const result = await routeAgentInboundEvent({
      agent,
      msgType: "event",
      eventType: "click",
      fromUser: "zhangsan",
      msg: { MsgType: "event", Event: "click", EventKey: "MENU_X" },
      auditSink: (event) => auditEvents.push(event),
    });

    expect(result.handled).toBe(true);
    expect(result.chainToAgent).toBe(false);
    expect(result.reason).toBe("unmatched_event_ignored");
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.category).toBe("runtime-error");
    expect(auditEvents[0]?.summary).toContain("invalid route eventKeyPattern");
    expect(auditEvents[0]?.error).toContain("routeId=invalid-pattern");
  });
});