# 企业微信被动回复消息配置指南

## 概述

本文档介绍如何在 OpenClaw 企业微信插件中为 Agent 渠道配置“被动回复消息”能力。

这个能力适合以下场景：

- 用户点击模板卡片后，插件需要在 5 秒内立即回包
- 回包成功后，还要继续执行异步业务处理
- 回包脚本超时或失败时，需要稳定降级为 `success`
- 回包脚本可以根据业务判断直接终止后续处理

如果你需要查看完整设计背景和协议细节，可以同时参考 [docs/PASSIVE_REPLY_PLAN.md](/Users/shao/.openclaw/extensions/wecom/docs/PASSIVE_REPLY_PLAN.md)。

## 适用场景

最常见的是模板卡片提交类事件，例如：

1. 用户点击卡片按钮提交审批
2. 插件立即回包，返回“按钮置灰”或“卡片已受理”的被动回复 XML
3. 插件继续执行 `postReplyHandler`
4. `postReplyHandler` 查询业务结果后，主动发消息给用户，或继续交给 AI 链路

## 配置思路

在 `openclaw.json` 中，这个能力依赖四块配置：

1. `inboundPolicy`：放通事件类型
2. `eventRouting.routes`：命中具体事件路由
3. `replyHandler`：负责 5 秒窗口内的被动回复
4. `postReplyHandler`：负责回包后的异步处理
5. `scriptRuntime`：启用并约束脚本执行

注意：

- `replyHandler` 只负责“回包阶段”
- `postReplyHandler` 只负责“回包之后”
- 事件路由统一使用 `postReplyHandler`；不再保留旧的 `handler` 配置字段

## 最小可用配置

推荐先从下面这个模板卡片场景开始：

```json
{
  "channels": {
    "wecom": {
      "accounts": {
        "default": {
          "agent": {
            "corpId": "wwxxxxxxxxxxxxxxxx",
            "agentSecret": "<AGENT_SECRET>",
            "agentId": 1000002,
            "token": "<CALLBACK_TOKEN>",
            "encodingAESKey": "<ENCODING_AES_KEY>",
            "inboundPolicy": {
              "eventEnabled": true,
              "eventPolicy": {
                "allowedEventTypes": [
                  "template_card_event"
                ]
              }
            },
            "eventRouting": {
              "unmatchedAction": "ignore",
              "routes": [
                {
                  "id": "template-card-submit",
                  "when": {
                    "eventType": "template_card_event"
                  },
                  "replyHandler": {
                    "type": "node_script",
                    "entry": "./scripts/wecom/reply-template-card.mjs",
                    "timeoutMs": 4500,
                    "responseMode": "passive_reply",
                    "allowSkipPostReplyHandler": true
                  },
                  "postReplyHandler": {
                    "enabled": true,
                    "type": "node_script",
                    "entry": "./scripts/wecom/post-template-card.mjs",
                    "timeoutMs": 15000,
                    "chainToAgent": false
                  }
                }
              ]
            },
            "scriptRuntime": {
              "enabled": true,
              "allowPaths": [
                "./scripts/wecom"
              ],
              "defaultTimeoutMs": 4500,
              "nodeCommand": "node",
              "pythonCommand": "python3"
            }
          }
        }
      }
    }
  }
}
```

> 如果你使用的是 legacy 单账号模式，也可以写在 `channels.wecom.agent` 下，字段结构一致。

## 配置块说明

### 1. inboundPolicy

`eventRouting` 只决定“命中后怎么处理”，不决定“事件是否允许进入处理链”。

真正决定事件是否会被处理的是 `inboundPolicy`：

- `eventEnabled: true`：开启 Agent event 处理
- `allowedEventTypes`：只放通指定事件类型

被动回复场景里，至少要放通你要处理的事件，例如：

- `template_card_event`
- `click`

如果这里没有放通，即使后面配了 `replyHandler`，脚本也不会执行。

### 2. eventRouting.routes

`routes` 按声明顺序匹配，命中第一条后停止继续向下匹配。

常用匹配条件：

| 字段 | 说明 |
|------|------|
| `eventType` | 事件类型，如 `template_card_event`、`click` |
| `eventKey` | 精确匹配事件 key |
| `eventKeyPrefix` | 前缀匹配事件 key |
| `eventKeyPattern` | 正则匹配事件 key |
| `changeType` | 通讯录类事件的变更类型 |

建议在被动回复场景里至少配一个稳定的 `id`，方便日志与审计定位。

### 3. replyHandler

`replyHandler` 负责 5 秒窗口内的同步回包。

当前支持字段：

| 字段 | 说明 |
|------|------|
| `type` | `node_script` 或 `python_script` |
| `entry` | 脚本路径 |
| `timeoutMs` | 回包脚本超时，建议小于 5000 |
| `responseMode` | `default` 或 `passive_reply` |
| `allowSkipPostReplyHandler` | 是否允许脚本跳过后续 `postReplyHandler` |

关键点：

- `responseMode: "passive_reply"` 才会进入被动回复模式
- `timeoutMs` 推荐设置为 `4500`
- 回包脚本 stdout 必须返回合法 JSON
- 回包脚本必须返回 `replyMessage`，内容必须是 XML 根节点字符串

#### `responseMode` 的含义

- `default` 或不填：保持普通事件路由行为，不等待被动回复 XML
- `passive_reply`：等待脚本返回 XML，再由平台加密签名后回包

#### `allowSkipPostReplyHandler` 的含义

这个开关控制 `replyHandler` 是否有权短路后续处理。

- `true`：脚本返回 `skipPostReplyHandler: true` 时，平台不再执行 `postReplyHandler`
- `false` 或不填：即使脚本返回了 `skipPostReplyHandler: true`，平台也会忽略这个意图

也就是说，只有下面两个条件同时满足时，后续处理才会被跳过：

1. 配置中 `allowSkipPostReplyHandler: true`
2. 脚本 stdout 中 `skipPostReplyHandler: true`

### 4. postReplyHandler

`postReplyHandler` 负责回包完成后的异步处理。

当前支持字段：

| 字段 | 说明 |
|------|------|
| `enabled` | 是否启用后处理脚本 |
| `type` | `node_script` 或 `python_script` |
| `entry` | 脚本路径 |
| `timeoutMs` | 后处理脚本超时 |
| `chainToAgent` | 静态指定脚本结束后继续进入 AI |

关键点：

- 只有 `enabled: true` 时，`postReplyHandler` 才会执行
- 即使 `replyHandler` 超时并降级返回 `success`，只要这里启用了，后处理仍会继续执行
- `postReplyHandler` 直接复用现有事件路由脚本协议：`action`、`reply.text`、`chainToAgent`

### 5. scriptRuntime

脚本运行时是整个能力的安全边界。

常用字段：

| 字段 | 说明 |
|------|------|
| `enabled` | 是否允许执行脚本 |
| `allowPaths` | 允许执行的脚本目录 |
| `defaultTimeoutMs` | 全局默认超时 |
| `nodeCommand` | Node.js 可执行命令 |
| `pythonCommand` | Python 可执行命令 |

如果脚本不在 `allowPaths` 范围内，会直接报错并拒绝执行。

## replyHandler 脚本规范

### 输入结构

`replyHandler` 通过 `stdin` 接收 JSON，示例如下：

```json
{
  "version": "1.0",
  "channel": "wecom",
  "phase": "reply",
  "accountId": "default",
  "receivedAt": 1710000000000,
  "message": {
    "msgType": "event",
    "eventType": "template_card_event",
    "eventKey": "approve_123",
    "changeType": null,
    "fromUser": "zhangsan",
    "toUser": "wwxxxxxxxxxxxxxxxx",
    "chatId": null,
    "agentId": 1000002,
    "createTime": 1710000000,
    "msgId": null,
    "raw": {
      "MsgType": "event",
      "Event": "template_card_event"
    }
  },
  "route": {
    "matchedRuleId": "template-card-submit",
    "handlerType": "node_script"
  }
}
```

### 输出结构

最小成功输出：

```json
{
  "ok": true,
  "responseMode": "passive_reply",
  "replyMessage": "<xml>...</xml>"
}
```

如果希望回包后直接终止后续 `postReplyHandler`：

```json
{
  "ok": true,
  "responseMode": "passive_reply",
  "replyMessage": "<xml>...</xml>",
  "skipPostReplyHandler": true
}
```

### Node.js 示例

```javascript
#!/usr/bin/env node
let raw = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  raw += chunk;
});

process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const eventKey = payload?.message?.eventKey ?? "";

  const response = {
    ok: true,
    responseMode: "passive_reply",
    replyMessage: `<xml><Content><![CDATA[已收到事件 ${eventKey}]]></Content></xml>`,
    skipPostReplyHandler: false
  };

  process.stdout.write(JSON.stringify(response));
});
```

### Python 示例

```python
#!/usr/bin/env python3
import json
import sys

def main():
    payload = json.load(sys.stdin)
    event_key = payload.get("message", {}).get("eventKey", "")

    response = {
        "ok": True,
        "responseMode": "passive_reply",
        "replyMessage": f"<xml><Content><![CDATA[已收到事件 {event_key}]]></Content></xml>",
        "skipPostReplyHandler": False,
    }

    json.dump(response, sys.stdout)

if __name__ == "__main__":
    main()
```

## postReplyHandler 脚本规范

### 输入结构

`postReplyHandler` 同样通过 `stdin` 接收 JSON，但相比普通事件脚本，会多一个 `reply` 上下文字段。

正常回包后的示例：

```json
{
  "version": "1.0",
  "channel": "wecom",
  "phase": "post_reply",
  "accountId": "default",
  "receivedAt": 1710000000000,
  "message": {
    "msgType": "event",
    "eventType": "template_card_event",
    "eventKey": "approve_123",
    "changeType": null,
    "fromUser": "zhangsan",
    "toUser": "wwxxxxxxxxxxxxxxxx",
    "chatId": null,
    "agentId": 1000002,
    "createTime": 1710000000,
    "msgId": null,
    "raw": {}
  },
  "route": {
    "matchedRuleId": "template-card-submit",
    "handlerType": "node_script"
  },
  "reply": {
    "sent": true,
    "responseMode": "passive_reply",
    "fallbackToSuccess": false,
    "reason": null
  }
}
```

回包阶段超时、已降级 `success` 的示例：

```json
{
  "reply": {
    "sent": false,
    "responseMode": "passive_reply",
    "fallbackToSuccess": true,
    "reason": "reply_timeout"
  }
}
```

### 输出结构

`postReplyHandler` 复用现有事件路由脚本协议：

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": {
    "text": "审批完成，结果已更新"
  },
  "chainToAgent": true
}
```

可用语义：

- `action: "reply_text"`：主动给用户发一条文本消息
- `action: "none"`：不主动回复
- `chainToAgent: true`：继续进入 AI 处理链

### `chainToAgent` 的两个来源

`postReplyHandler` 的最终 `chainToAgent` 结果，等价于：

```ts
finalChainToAgent =
  postReplyHandler.chainToAgent === true || scriptResponse.chainToAgent === true;
```

可以这样理解：

- `postReplyHandler.chainToAgent` 是静态放行开关
- 脚本输出里的 `chainToAgent` 是动态决策结果
- 只要任意一方明确为 `true`，事件就会继续进入 AI 处理链

## 运行时行为总结

### 正常路径

1. 事件先经过 `allowedEventTypes` 放通
2. 命中 `routes` 后执行 `replyHandler`
3. `replyHandler` 返回 XML，平台加密签名后回包
4. 如果配置了 `postReplyHandler.enabled: true`，继续执行后处理脚本
5. 后处理脚本可以主动回复用户，也可以继续交给 AI

### replyHandler 超时或失败

出现以下情况时，平台会统一返回 `success`：

- 脚本超时
- 脚本异常退出
- stdout 不是合法 JSON
- 缺少 `replyMessage`
- `replyMessage` 不是 XML 根节点
- 加密签名失败

如果同时配置了 `postReplyHandler.enabled: true`，事件仍会继续执行后处理脚本。

### skipPostReplyHandler 生效条件

只有满足下面两个条件，`skipPostReplyHandler` 才会真的生效：

1. `replyHandler.allowSkipPostReplyHandler: true`
2. `replyHandler` stdout 返回 `skipPostReplyHandler: true`

否则平台会忽略跳过意图，继续执行 `postReplyHandler`。

## 常见踩坑

### 1. 只配了 eventRouting，没有放通事件

现象：脚本完全不执行。

解决方案：

- 确认 `inboundPolicy.eventEnabled` 为 `true`
- 确认 `allowedEventTypes` 包含对应事件类型

### 2. replyHandler 超时设置过长

现象：企业微信持续重试，或回包不稳定。

解决方案：

- `replyHandler.timeoutMs` 建议设置为 `4500`
- 不要把回包脚本超时设置到 `5000ms` 以上

### 3. replyMessage 不是合法 XML 根节点

现象：回包阶段直接降级成 `success`。

解决方案：

- 确保脚本返回的是 XML 字符串
- 最外层必须以 `<xml` 开头并以 `</xml>` 结束
- 不要把调试日志打印到 stdout

### 4. 希望跳过 postReplyHandler，但没有生效

现象：脚本明明返回了 `skipPostReplyHandler: true`，后处理仍然执行。

解决方案：

- 检查 `replyHandler.allowSkipPostReplyHandler` 是否为 `true`
- 确认返回字段名称是 `skipPostReplyHandler`，不要写成别的名字

### 5. postReplyHandler 没有执行

现象：回包成功或降级 `success` 后，没有进入后处理脚本。

解决方案：

- 确认 `postReplyHandler.enabled` 为 `true`
- 确认脚本路径在 `scriptRuntime.allowPaths` 范围内
- 确认没有被 `skipPostReplyHandler` 短路

### 6. 脚本路径未授权

错误信息：

```
script path is not allowed: /path/to/script.mjs
```

解决方案：

- 确保脚本目录在 `scriptRuntime.allowPaths` 中
- 建议 `entry` 和 `allowPaths` 使用同一套相对路径或绝对路径口径

### 7. 脚本运行时未启用

错误信息：

```
script runtime is disabled
```

解决方案：

- 确保 `scriptRuntime.enabled` 设置为 `true`

## 推荐落地方式

如果你是从普通事件路由迁移到被动回复场景，建议按这个顺序做：

1. 先保留原有 `eventRouting.routes` 匹配条件不变
2. 把“5 秒内必须完成的动作”迁移到 `replyHandler`
3. 把“回包后才需要做的动作”迁移到 `postReplyHandler`
4. 明确哪些场景需要 `skipPostReplyHandler`
5. 最后再决定 `postReplyHandler` 是否要继续 `chainToAgent`

这样迁移的风险最小，也更容易在日志里分清“回包阶段”和“后处理阶段”的问题。