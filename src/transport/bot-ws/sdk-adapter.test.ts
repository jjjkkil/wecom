import { afterEach, describe, expect, it, vi } from "vitest";

const sdkMockState = vi.hoisted(() => {
  class MockWSClient {
    readonly handlers = new Map<string, Array<(payload: any) => void>>();
    readonly isConnected = true;
    readonly replyStream = vi.fn().mockResolvedValue(undefined);
    readonly replyWelcome = vi.fn().mockResolvedValue(undefined);

    constructor(_options: unknown) {
      sdkMockState.client = this;
    }

    on(event: string, handler: (payload: any) => void): void {
      const current = this.handlers.get(event) ?? [];
      current.push(handler);
      this.handlers.set(event, current);
    }

    emit(event: string, payload: any): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload);
      }
    }

    connect(): void {}

    disconnect(): void {}
  }

  return {
    client: null as InstanceType<typeof MockWSClient> | null,
    MockWSClient,
  };
});

const appMockState = vi.hoisted(() => ({
  runtimes: new Map<string, any>(),
  pushHandles: new Map<string, any>(),
}));

vi.mock("@wecom/aibot-node-sdk", () => ({
  default: {
    WSClient: sdkMockState.MockWSClient,
  },
  WSClient: sdkMockState.MockWSClient,
  generateReqId: (prefix: string) => `${prefix}-1`,
}));

vi.mock("../../app/index.js", () => ({
  registerBotWsPushHandle: (accountId: string, handle: unknown) => {
    appMockState.pushHandles.set(accountId, handle);
  },
  unregisterBotWsPushHandle: (accountId: string) => {
    appMockState.pushHandles.delete(accountId);
  },
  getAccountRuntime: (accountId: string) => appMockState.runtimes.get(accountId),
  getBotWsPushHandle: (accountId: string) => appMockState.pushHandles.get(accountId),
}));

import { BotWsSdkAdapter } from "./sdk-adapter.js";

const waitForAsyncCallbacks = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("BotWsSdkAdapter", () => {
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  afterEach(() => {
    process.off("unhandledRejection", onUnhandledRejection);
    unhandledRejections.length = 0;
    sdkMockState.client = null;
    appMockState.runtimes.clear();
    appMockState.pushHandles.clear();
  });

  it("contains frame handler rejections instead of leaking unhandled rejections", async () => {
    process.on("unhandledRejection", onUnhandledRejection);

    const runtime = {
      account: {
        accountId: "acc-1",
        bot: {
          wsConfigured: true,
          ws: {
            botId: "bot-1",
            secret: "secret-1",
          },
          config: {},
        },
      },
      handleEvent: vi.fn().mockRejectedValue(new Error("frame exploded")),
      updateTransportSession: vi.fn(),
      touchTransportSession: vi.fn(),
      recordOperationalIssue: vi.fn(),
    };
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    new BotWsSdkAdapter(runtime as any, log as any).start();

    sdkMockState.client?.emit("message", {
      cmd: "aibot_msg_callback",
      headers: { req_id: "req-1" },
      body: {
        msgid: "msg-1",
        msgtype: "text",
        from: { userid: "user-1" },
        text: { content: "hello" },
      },
    });

    await waitForAsyncCallbacks();

    expect(runtime.handleEvent).toHaveBeenCalledTimes(1);
    expect(runtime.recordOperationalIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: "bot-ws",
        category: "runtime-error",
        messageId: "msg-1",
        error: "frame exploded",
      }),
    );
    expect(runtime.touchTransportSession).toHaveBeenCalledWith(
      "bot-ws",
      expect.objectContaining({
        lastError: "frame exploded",
      }),
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "frame handler failed account=acc-1 reqId=req-1 message=frame exploded",
      ),
    );
    expect(unhandledRejections).toHaveLength(0);
  });

  it("short-circuits enter_chat welcome events to a static ws welcome reply", async () => {
    process.on("unhandledRejection", onUnhandledRejection);

    const runtime = {
      account: {
        accountId: "acc-1",
        bot: {
          wsConfigured: true,
          ws: {
            botId: "bot-1",
            secret: "secret-1",
          },
          config: {
            welcomeText: "欢迎来到 WeCom",
          },
        },
      },
      handleEvent: vi.fn().mockResolvedValue(undefined),
      updateTransportSession: vi.fn(),
      touchTransportSession: vi.fn(),
      recordOperationalIssue: vi.fn(),
    };
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    new BotWsSdkAdapter(runtime as any, log as any).start();

    sdkMockState.client?.emit("event", {
      cmd: "aibot_event_callback",
      headers: { req_id: "req-welcome" },
      body: {
        msgid: "msg-welcome",
        msgtype: "event",
        chattype: "single",
        from: { userid: "user-1" },
        event: { eventtype: "enter_chat" },
      },
    });

    await waitForAsyncCallbacks();

    expect(runtime.handleEvent).not.toHaveBeenCalled();
    expect(sdkMockState.client?.replyWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { req_id: "req-welcome" },
      }),
      {
        msgtype: "text",
        text: { content: "欢迎来到 WeCom" },
      },
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("static welcome delivered account=acc-1 messageId=msg-welcome"),
    );
    expect(unhandledRejections).toHaveLength(0);
  });

  it("dedupes fanout dispatch by message/session identity while source runtime continues handling", async () => {
    process.on("unhandledRejection", onUnhandledRejection);

    const sourceRuntime = {
      account: {
        accountId: "acc-1",
        bot: {
          wsConfigured: true,
          ws: {
            botId: "bot-1",
            secret: "secret-1",
          },
          config: {},
        },
      },
      cfg: {
        channels: {
          wecom: {
            routing: {
              fanoutMentionsInGroup: true,
              fanoutDedupeWindowMs: 60000,
            },
            accounts: {
              "acc-1": {
                name: "源机器人",
                bot: { aibotid: "bot_1" },
              },
              "acc-2": {
                name: "目标机器人",
                bot: { aibotid: "bot_2" },
              },
            },
          },
        },
      },
      handleEvent: vi.fn().mockResolvedValue(undefined),
      updateTransportSession: vi.fn(),
      touchTransportSession: vi.fn(),
      recordOperationalIssue: vi.fn(),
    };
    const targetHandleEvent = vi.fn().mockResolvedValue(undefined);
    appMockState.runtimes.set("acc-2", {
      account: {
        bot: {
          configured: true,
          wsConfigured: true,
        },
      },
      handleEvent: targetHandleEvent,
    });

    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    new BotWsSdkAdapter(sourceRuntime as any, log as any).start();

    const duplicatedFrame = {
      cmd: "aibot_msg_callback",
      headers: { req_id: "req-fanout-1" },
      body: {
        msgid: "msg-fanout-1",
        msgtype: "text",
        chattype: "group",
        chatid: "group-42",
        from: { userid: "user-42" },
        text: { content: "<@acc-2> hello" },
      },
    };

    sdkMockState.client?.emit("message", duplicatedFrame);
    sdkMockState.client?.emit("message", duplicatedFrame);

    await waitForAsyncCallbacks();

    expect(targetHandleEvent).toHaveBeenCalledTimes(1);
    expect(sourceRuntime.handleEvent).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("fanout dedupe hit sourceAccount=acc-1 targetAccount=acc-2"),
    );
    expect(unhandledRejections).toHaveLength(0);
  });
});
