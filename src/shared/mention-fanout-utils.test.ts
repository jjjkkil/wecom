import { describe, it, expect } from "vitest";
import {
  buildFanoutDeliveryDedupeKey,
  extractMentionedAccountIds,
  buildMentionAliasLookup,
  resolveFanoutDedupeWindowMs,
} from "./mention-fanout-utils.js";

describe("mention-fanout-utils", () => {
  describe("extractMentionedAccountIds with name-based matching", () => {
    const mockConfig = {
      channels: {
        wecom: {
          accounts: {
            red: {
              name: "红机器人",
              bot: { aibotid: "bot_red", botIds: ["botid-red"] },
            },
            yellow: {
              name: "黄机器人",
              bot: { aibotid: "bot_yellow", botIds: ["botid-yellow"] },
            },
            blue: {
              name: "蓝机器人",
              bot: { aibotid: "bot_blue", botIds: ["botid-blue"] },
            },
          },
        },
      },
    };

    const aliasLookup = buildMentionAliasLookup(mockConfig);

    it("matches @name with space after", () => {
      const result = extractMentionedAccountIds({
        text: "@红机器人 hello world",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("red");
    });

    it("does NOT match @name without space after", () => {
      const result = extractMentionedAccountIds({
        text: "@红机器人hello world",
        aliasToAccountId: aliasLookup,
      });
      expect(result).not.toContain("red");
    });

    it("matches multiple mentions with spaces", () => {
      const result = extractMentionedAccountIds({
        text: "群里 @红机器人 和 @黄机器人 请帮忙",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("red");
      expect(result).toContain("yellow");
      expect(result).not.toContain("blue");
    });

    it("matches all three mentions", () => {
      const result = extractMentionedAccountIds({
        text: "@红机器人 @黄机器人 @蓝机器人 come on",
        aliasToAccountId: aliasLookup,
      });
      expect(new Set(result)).toEqual(new Set(["red", "yellow", "blue"]));
    });

    it("ignores unknown names", () => {
      const result = extractMentionedAccountIds({
        text: "@未知机器人 @红机器人 test",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("red");
      expect(result.length).toBe(1);
    });

    it("matches angle bracket format <@id>", () => {
      const result = extractMentionedAccountIds({
        text: "<@bot_yellow> hello",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("yellow");
    });

    it("matches by account ID", () => {
      const result = extractMentionedAccountIds({
        text: "<@red> test",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("red");
    });

    it("matches by aibotid", () => {
      const result = extractMentionedAccountIds({
        text: "<@bot_blue> message",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("blue");
    });

    it("matches by botId", () => {
      const result = extractMentionedAccountIds({
        text: "<@botid-yellow> test",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("yellow");
    });

    it("matches wecom: prefix format with English", () => {
      const result = extractMentionedAccountIds({
        text: "call wecom:yellow please",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("yellow");
    });

    it("handles newlines and multiple spaces", () => {
      const result = extractMentionedAccountIds({
        text: "@红机器人  \n@黄机器人   help",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("red");
      expect(result).toContain("yellow");
    });

    it("handles natural conversation format", () => {
      const result = extractMentionedAccountIds({
        text: "各位，@红机器人 @黄机器人 @蓝机器人 请立即处理此事件！",
        aliasToAccountId: aliasLookup,
      });
      expect(new Set(result)).toEqual(new Set(["red", "yellow", "blue"]));
    });

    it("does not match partial names", () => {
      const result = extractMentionedAccountIds({
        text: "@红 @机器人 test",
        aliasToAccountId: aliasLookup,
      });
      // Neither exact matches should occur since they don't match configured names
      expect(result).not.toContain("red");
    });

    it("case-insensitive matching", () => {
      const result = extractMentionedAccountIds({
        text: "<@BOT_RED> hello",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toContain("red");
    });

    it("handles empty text", () => {
      const result = extractMentionedAccountIds({
        text: "",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toEqual([]);
    });

    it("handles text with no mentions", () => {
      const result = extractMentionedAccountIds({
        text: "hello world this is a message",
        aliasToAccountId: aliasLookup,
      });
      expect(result).toEqual([]);
    });

    it("deduplicates mention across multiple patterns", () => {
      // If same account is mentioned via different patterns, should only appear once
      const result = extractMentionedAccountIds({
        text: "@红机器人 <@bot_red> test",
        aliasToAccountId: aliasLookup,
      });
      const redCount = result.filter((id) => id === "red").length;
      expect(redCount).toBe(1);
    });
  });

  describe("buildMentionAliasLookup", () => {
    it("includes account ID in aliases", () => {
      const config = {
        channels: {
          wecom: {
            accounts: {
              red: {
                name: "红",
                bot: { aibotid: "botid1" },
              },
            },
          },
        },
      };
      const lookup = buildMentionAliasLookup(config);
      expect(lookup.get("red")).toBe("red");
    });

    it("includes name in aliases", () => {
      const config = {
        channels: {
          wecom: {
            accounts: {
              red: {
                name: "红机器人",
                bot: {},
              },
            },
          },
        },
      };
      const lookup = buildMentionAliasLookup(config);
      expect(lookup.get("红机器人")).toBe("red");
    });

    it("includes aibotid in aliases", () => {
      const config = {
        channels: {
          wecom: {
            accounts: {
              red: {
                bot: { aibotid: "botid-red" },
              },
            },
          },
        },
      };
      const lookup = buildMentionAliasLookup(config);
      expect(lookup.get("botid-red")).toBe("red");
    });

    it("includes botIds in aliases", () => {
      const config = {
        channels: {
          wecom: {
            accounts: {
              red: {
                bot: { botIds: ["botid1", "botid2"] },
              },
            },
          },
        },
      };
      const lookup = buildMentionAliasLookup(config);
      expect(lookup.get("botid1")).toBe("red");
      expect(lookup.get("botid2")).toBe("red");
    });

    it("handles missing bot config gracefully", () => {
      const config = {
        channels: {
          wecom: {
            accounts: {
              red: {
                name: "红",
              },
            },
          },
        },
      };
      const lookup = buildMentionAliasLookup(config);
      expect(lookup.get("红")).toBe("red");
    });

    it("case-insensitive storage in lookup", () => {
      const config = {
        channels: {
          wecom: {
            accounts: {
              red: {
                name: "红bot",
                bot: { aibotid: "BOT_RED" },
              },
            },
          },
        },
      };
      const lookup = buildMentionAliasLookup(config);
        expect(lookup.get("红bot")).toBe("red");
        expect(lookup.get("bot_red")).toBe("red");
        expect(lookup.get("BOT_RED")).toBeUndefined(); // Uppercase key not in map
        // But if you lowercase it first (as extraction does), it works
        expect(lookup.get("BOT_RED".toLowerCase())).toBe("red");
    });
  });

  describe("fanout config helpers", () => {
    it("uses default dedupe window when config is missing", () => {
      expect(resolveFanoutDedupeWindowMs({})).toBe(120000);
    });

    it("clamps dedupe window to allowed range", () => {
      expect(
        resolveFanoutDedupeWindowMs({
          channels: { wecom: { routing: { fanoutDedupeWindowMs: 500 } } },
        }),
      ).toBe(1000);
      expect(
        resolveFanoutDedupeWindowMs({
          channels: { wecom: { routing: { fanoutDedupeWindowMs: 999999999 } } },
        }),
      ).toBe(1800000);
    });

    it("builds stable dedupe key from session and message identity", () => {
      const key = buildFanoutDeliveryDedupeKey({
        sourceAccountId: "acc-1",
        targetAccountId: "acc-2",
        peerId: "group-1",
        senderId: "user-1",
        messageId: "msg-1",
        reqId: "req-1",
      });
      expect(key).toBe("acc-1|acc-2|group-1|user-1|msg-1");
    });

    it("falls back to reqId when messageId is missing", () => {
      const key = buildFanoutDeliveryDedupeKey({
        sourceAccountId: "acc-1",
        targetAccountId: "acc-2",
        peerId: "group-1",
        senderId: "user-1",
        reqId: "req-only",
      });
      expect(key).toBe("acc-1|acc-2|group-1|user-1|req-only");
    });
  });
});
