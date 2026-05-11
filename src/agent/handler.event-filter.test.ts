import { describe, expect, it } from "vitest";

import { shouldProcessAgentInboundMessage, shouldSuppressAgentReplyText } from "./handler.js";

describe("shouldProcessAgentInboundMessage", () => {
    it("allows enter_agent/subscribe through the filter (handled earlier by static welcome)", () => {
        const enterAgent = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "enter_agent",
            fromUser: "zhangsan",
        });
        expect(enterAgent.shouldProcess).toBe(true);
        expect(enterAgent.reason).toBe("allowed_event:enter_agent");

        const subscribe = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "subscribe",
            fromUser: "lisi",
        });
        expect(subscribe.shouldProcess).toBe(true);
        expect(subscribe.reason).toBe("allowed_event:subscribe");
    });

    it("skips unknown event callbacks so they do not create sessions", () => {
        const unknown = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "some_random_event",
            fromUser: "zhangsan",
        });
        expect(unknown.shouldProcess).toBe(false);
        expect(unknown.reason).toBe("event:some_random_event");
    });

    it("allows official smart_sheet_change event in compatibility mode", () => {
        const smartSheet = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "smart_sheet_change",
            fromUser: "zhangsan",
        });
        expect(smartSheet.shouldProcess).toBe(true);
        expect(smartSheet.reason).toBe("allowed_event:smart_sheet_change");
    });

    it("allows official doc_change event in compatibility mode", () => {
        const docChange = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "doc_change",
            fromUser: "zhangsan",
        });
        expect(docChange.shouldProcess).toBe(true);
        expect(docChange.reason).toBe("allowed_event:doc_change");
    });

    it("allows additional official callback events in compatibility mode", () => {
        const eventTypes = [
            "unsubscribe",
            "change_contact",
            "template_card_menu_event",
            "sys_approval_change",
            "open_approval_change",
            "inactive_alert",
        ];
        for (const eventType of eventTypes) {
            const decision = shouldProcessAgentInboundMessage({
                msgType: "event",
                eventType,
                fromUser: "zhangsan",
            });
            expect(decision.shouldProcess).toBe(true);
            expect(decision.reason).toBe(`allowed_event:${eventType}`);
        }
    });

    it("blocks event processing when eventEnabled is false", () => {
        const disabled = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "click",
            fromUser: "zhangsan",
            eventEnabled: false,
        });
        expect(disabled.shouldProcess).toBe(false);
        expect(disabled.reason).toBe("event_disabled");
    });

    it("allows configured custom event types", () => {
        const custom = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "click",
            fromUser: "zhangsan",
            eventEnabled: true,
            allowedEventTypes: ["click"],
        });
        expect(custom.shouldProcess).toBe(true);
        expect(custom.reason).toBe("allowed_event:click");
    });

    it("does not allow compatibility events when strict config is present", () => {
        const docEvent = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "doc_content_change",
            fromUser: "zhangsan",
            eventEnabled: true,
            allowedEventTypes: ["click"],
        });
        expect(docEvent.shouldProcess).toBe(false);
        expect(docEvent.reason).toBe("event:doc_content_change");
    });

    it("normalizes configured event type values before matching", () => {
        const custom = shouldProcessAgentInboundMessage({
            msgType: "event",
            eventType: "view_miniprogram",
            fromUser: "zhangsan",
            eventEnabled: true,
            allowedEventTypes: [" VIEW_MINIPROGRAM "],
        });
        expect(custom.shouldProcess).toBe(true);
        expect(custom.reason).toBe("allowed_event:view_miniprogram");
    });

    it("skips system sender callbacks", () => {
        const systemSender = shouldProcessAgentInboundMessage({
            msgType: "text",
            fromUser: "sys",
        });
        expect(systemSender.shouldProcess).toBe(false);
        expect(systemSender.reason).toBe("system_sender");
    });

    it("skips messages with missing sender id", () => {
        const missingSender = shouldProcessAgentInboundMessage({
            msgType: "text",
            fromUser: "   ",
        });
        expect(missingSender.shouldProcess).toBe(false);
        expect(missingSender.reason).toBe("missing_sender");
    });


    it("allows group chat messages when sender id is missing", () => {
        const groupWithoutSender = shouldProcessAgentInboundMessage({
            msgType: "file",
            fromUser: "   ",
            chatId: "wrbchat_123",
        });
        expect(groupWithoutSender.shouldProcess).toBe(true);
        expect(groupWithoutSender.reason).toBe("missing_sender_but_group_chat");
    });

    it("allows normal user text message processing", () => {
        const normalMessage = shouldProcessAgentInboundMessage({
            msgType: "text",
            fromUser: "wangwu",
        });
        expect(normalMessage.shouldProcess).toBe(true);
        expect(normalMessage.reason).toBe("user_message");
    });
});

describe("shouldSuppressAgentReplyText", () => {
    it("keeps plain text replies when no media reply has been seen", () => {
        expect(
            shouldSuppressAgentReplyText({
                text: "这里是正常文本",
                mediaReplySeen: false,
            }),
        ).toBe(false);
    });

    it("suppresses companion text once the reply flow includes media", () => {
        expect(
            shouldSuppressAgentReplyText({
                text: "文件已发送，请查收",
                mediaReplySeen: true,
            }),
        ).toBe(true);
    });

    it("does not suppress empty text even after media replies", () => {
        expect(
            shouldSuppressAgentReplyText({
                text: "   ",
                mediaReplySeen: true,
            }),
        ).toBe(false);
    });
});
