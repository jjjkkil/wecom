# 企业微信自定义菜单与 Click 事件配置指南

## 概述

本文档介绍如何在 OpenClaw 企业微信插件中配置自定义菜单，并处理 click 类型按钮的事件。

## 创建菜单

### API 接口

```
POST https://qyapi.weixin.qq.com/cgi-bin/menu/create?access_token=ACCESS_TOKEN&agentid=AGENTID
```

### 菜单结构示例

```json
{
  "button": [
    {
      "type": "click",
      "name": "Python测试",
      "key": "TEST_CLICK_PY"
    },
    {
      "type": "click",
      "name": "Node测试",
      "key": "TEST_CLICK_JS"
    },
    {
      "name": "更多",
      "sub_button": [
        {
          "type": "view",
          "name": "打开网页",
          "url": "https://work.weixin.qq.com"
        },
        {
          "type": "click",
          "name": "菜单信息",
          "key": "MENU_INFO"
        }
      ]
    }
  ]
}
```

### 支持的按钮类型

| 类型 | 说明 |
|------|------|
| `click` | 点击推事件，触发事件推送 |
| `view` | 跳转URL，打开网页 |
| `scancode_push` | 扫码推事件 |
| `scancode_waitmsg` | 扫码推事件且弹出提示框 |
| `pic_sysphoto` | 弹出系统拍照发图 |
| `pic_photo_or_album` | 弹出拍照或者相册发图 |
| `pic_weixin` | 弹出企业微信相册发图器 |
| `location_select` | 弹出地理位置选择器 |
| `view_miniprogram` | 跳转到小程序 |

## 配置事件路由

在 `openclaw.json` 中配置 `eventRouting` 和 `scriptRuntime`：

```json
{
  "channels": {
    "wecom": {
      "accounts": {
        "your-account": {
          "agent": {
            "eventRouting": {
              "unmatchedAction": "forwardToAgent",
              "routes": [
                {
                  "id": "test-click-python",
                  "when": { 
                    "eventType": "click", 
                    "eventKey": "TEST_CLICK_PY" 
                  },
                  "handler": { 
                    "type": "python_script", 
                    "entry": "/path/to/script.py" 
                  }
                },
                {
                  "id": "test-click-js",
                  "when": { 
                    "eventType": "click", 
                    "eventKey": "TEST_CLICK_JS" 
                  },
                  "handler": { 
                    "type": "node_script", 
                    "entry": "/path/to/script.mjs" 
                  }
                },
                {
                  "id": "menu-info-echo",
                  "when": { 
                    "eventType": "click", 
                    "eventKey": "MENU_INFO" 
                  },
                  "handler": { 
                    "type": "builtin", 
                    "name": "echo" 
                  }
                }
              ]
            },
            "scriptRuntime": {
              "enabled": true,
              "allowPaths": ["/path/to/scripts"],
              "defaultTimeoutMs": 10000,
              "pythonCommand": "python3",
              "nodeCommand": "node"
            }
          }
        }
      }
    }
  }
}
```

## 事件路由配置说明

### unmatchedAction（未匹配事件的处理方式）

当收到的事件**没有匹配任何路由**时，由 `unmatchedAction` 决定如何处理：

- `ignore` - 未匹配的事件直接忽略，不处理也不回复
- `forwardToAgent` - 未匹配的事件传递给 Agent（AI）处理

**注意：** 这个配置只影响**未匹配路由**的事件。如果事件匹配了路由，则由路由的 handler 决定后续行为。

### 路由匹配条件 (when)

| 字段 | 说明 |
|------|------|
| `eventType` | 事件类型，如 `click`、`change_contact` |
| `eventKey` | 精确匹配事件 key |
| `eventKeyPrefix` | 前缀匹配事件 key |
| `eventKeyPattern` | 正则匹配事件 key |
| `changeType` | 通讯录变更类型，如 `create_user` |

### Handler 类型

| 类型 | 说明 |
|------|------|
| `builtin` | 内置处理器，目前支持 `echo` |
| `node_script` | Node.js 脚本 |
| `python_script` | Python 脚本 |

### `chainToAgent` 的两个来源

`chainToAgent` 现在只表达一个意思：当前事件处理完成后，是否继续进入默认 Agent（AI）流程。

这个开关有两个输入来源，但它们控制的是同一件事，不是两个不同功能：

#### 1. Handler 配置里的 `chainToAgent`

在 `openclaw.json` 的 handler 中配置：

```json
{
  "handler": {
    "type": "python_script",
    "entry": "/path/to/script.py",
    "chainToAgent": true
  }
}
```

**特点：**
- 这是静态配置，适合声明“这条路由处理完后一定继续走 Agent”
- 只有设为 `true` 才会产生强制效果
- 设为 `false` 和不写，在当前实现里效果相同，都不会阻止脚本返回 `true`

#### 2. 脚本返回里的 `chainToAgent`

脚本通过 stdout 返回 JSON：

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": {
    "text": "回复内容"
  },
  "chainToAgent": false  // 脚本动态决定
}
```

**特点：**
- 这是动态决策，适合脚本根据业务条件决定是否继续走 Agent
- 当 handler 没有把 `chainToAgent` 设为 `true` 时，以脚本返回为准
- 如果脚本不返回该字段，默认为 `false`

#### 实际合并规则

代码中的最终判断等价于：

```ts
finalChainToAgent =
  handler.chainToAgent === true || scriptResponse.chainToAgent === true;
```

可以把它理解为：

- `handler.chainToAgent` 是“静态放行开关”
- `scriptResponse.chainToAgent` 是“脚本运行后的动态放行结果”
- 任意一方明确返回 `true`，都会继续进入默认 Agent 流程
- 两边都不是 `true` 时，才会在当前路由处理后结束

#### 行为总结

| Handler 配置 | 脚本返回 | 最终行为 |
|-------------|---------|---------|
| `true` | `false` | `true` |
| `true` | `true` | `true` |
| `false` | `true` | `true` |
| 未设置 | `true` | `true` |
| 未设置 / `false` | `false` | `false` |
| 未设置 / `false` | 未返回 | `false` |

**关键点：** 当前实现里不存在“`false` 覆盖 `true`”。只有 `true` 会向上抬高最终结果。

#### 推荐做法

**场景 1：脚本完全控制**
- Handler 配置中**不设置** `chainToAgent`
- 脚本根据需要返回 `true` 或 `false`

```json
// openclaw.json
"handler": {
  "type": "python_script",
  "entry": "/path/to/script.py"
  // 不写 chainToAgent
}
```

```python
# script.py - 动态决定
if some_condition:
    response["chainToAgent"] = True  # 继续 AI 处理
else:
    response["chainToAgent"] = False  # 到此结束
```

**场景 2：固定继续走 Agent**
- Handler 配置中设置 `"chainToAgent": true`
- 此时即使脚本返回 `false`，最终仍会继续进入默认 Agent 流程

```json
// openclaw.json - 固定走 AI 流程
"handler": {
  "type": "python_script",
  "entry": "/path/to/script.py",
  "chainToAgent": true
}
```

**场景 3：固定不继续走 Agent**
- 不要依赖 handler 里的 `"chainToAgent": false`
- 应该保持 handler 不写该字段，并让脚本稳定返回 `false`

也就是说：

- 想“固定继续”，可以用 handler 配置 `true`
- 想“固定停止”，应由脚本返回 `false` 来保证

## 脚本编写规范

脚本通过 `stdin` 接收 JSON 数据，通过 `stdout` 返回 JSON 响应。

### 输入格式 (envelope)

```json
{
  "version": "1.0",
  "channel": "wecom",
  "accountId": "blue",
  "receivedAt": 1775963707523,
  "message": {
    "msgType": "event",
    "eventType": "click",
    "eventKey": "TEST_CLICK_PY",
    "changeType": null,
    "fromUser": "GuanXiaoPeng",
    "toUser": "corp-id",
    "chatId": null,
    "agentId": 1000015,
    "createTime": 1775963707,
    "msgId": "msg-id",
    "raw": { /* 原始 XML 解析数据 */ }
  },
  "route": {
    "matchedRuleId": "test-click-python",
    "handlerType": "python_script"
  }
}
```

### 输出格式 (response)

```json
{
  "ok": true,
  "action": "reply_text",
  "reply": {
    "text": "回复内容"
  },
  "chainToAgent": false
}
```

### action 类型

- `none` - 不回复
- `reply_text` - 回复文本消息

### Python 脚本示例

```python
#!/usr/bin/env python3
import json
import sys

def main():
    payload = json.load(sys.stdin)
    message = payload.get("message", {})
    event_key = message.get("eventKey") or ""
    from_user = message.get("fromUser", "")
    
    response = {
        "ok": True,
        "action": "reply_text",
        "reply": {
            "text": f"收到点击事件: {event_key}\n来自用户: {from_user}"
        },
        "chainToAgent": False
    }
    
    json.dump(response, sys.stdout)

if __name__ == "__main__":
    main()
```

### Node.js 脚本示例

```javascript
#!/usr/bin/env node
let raw = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  raw += chunk;
});

process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const message = payload?.message ?? {};
  const eventKey = message?.eventKey ?? "";
  const fromUser = message?.fromUser ?? "";

  const response = {
    ok: true,
    action: "reply_text",
    reply: {
      text: `收到点击事件: ${eventKey}\n来自用户: ${fromUser}`
    },
    chainToAgent: false
  };

  process.stdout.write(JSON.stringify(response));
});
```

## 常见踩坑

### 1. IP 白名单限制

**错误信息：**
```
{"errcode": 60020, "errmsg": "not allow to access from your ip"}
```

**解决方案：**
- 在企业微信管理后台配置可信 IP 列表
- 或使用配置的代理服务器

### 2. 菜单名称长度限制

**错误信息：**
```
{"errcode": 40058, "errmsg": "button.name exceed max length 16"}
```

**解决方案：**
- 一级菜单名称不超过 16 字节（约 16 个英文字符或 8 个中文字符）
- 子菜单名称不超过 40 字节
- 避免使用 emoji，会占用更多字节

### 3. 脚本路径未授权

**错误信息：**
```
script path is not allowed: /path/to/script.py
```

**解决方案：**
- 确保脚本路径在 `scriptRuntime.allowPaths` 配置的目录下
- 路径必须是绝对路径

### 4. 脚本运行时未启用

**错误信息：**
```
script runtime is disabled
```

**解决方案：**
- 确保 `scriptRuntime.enabled` 设置为 `true`

### 5. 脚本输出格式错误

**错误信息：**
```
script output is not valid JSON
```

**解决方案：**
- 确保脚本输出是有效的 JSON 格式
- 不要输出调试信息到 stdout
- 错误信息可以输出到 stderr

### 6. 脚本执行超时

**错误信息：**
```
script execution timed out after 5000ms
```

**解决方案：**
- 增加 `timeoutMs` 配置（handler 级别或 `defaultTimeoutMs` 全局）
- 优化脚本性能

### 7. Access Token 过期

**错误信息：**
```
{"errcode": 42001, "errmsg": "access_token expired"}
```

**解决方案：**
- 重新获取 access_token
- access_token 有效期为 2 小时

### 8. 菜单不显示

**可能原因：**
- 应用未发布（需要发布后才对成员可见）
- 成员不在应用可见范围内
- 缓存问题（重新进入应用或等待几分钟）

## 调试技巧

### 1. 查看当前菜单

```bash
curl "https://qyapi.weixin.qq.com/cgi-bin/menu/get?access_token=TOKEN&agentid=AGENTID"
```

### 2. 删除菜单

```bash
curl "https://qyapi.weixin.qq.com/cgi-bin/menu/delete?access_token=TOKEN&agentid=AGENTID"
```

### 3. 本地测试脚本

```bash
# 准备测试数据
echo '{"version":"1.0","channel":"wecom","accountId":"blue","message":{"eventType":"click","eventKey":"TEST","fromUser":"test"},"route":{"matchedRuleId":"test","handlerType":"python_script"}}' | python3 script.py
```

### 4. 查看 OpenClaw 日志

```bash
openclaw logs --tail 100
```

## 参考文档

- [企业微信创建菜单 API](https://developer.work.weixin.qq.com/document/path/90231)
- [企业微信接收事件推送](https://developer.work.weixin.qq.com/document/path/90240)
