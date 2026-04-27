#!/usr/bin/env python3
import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        json.dump(
            {
                "ok": False,
                "action": "reply_text",
                "reply": {
                    "text": "后处理脚本解析输入失败，请联系管理员。",
                },
                "chainToAgent": False,
                "error": "invalid input payload",
            },
            sys.stdout,
            ensure_ascii=False,
        )
        return 0

    message = payload.get("message", {}) if isinstance(payload, dict) else {}
    reply = payload.get("reply", {}) if isinstance(payload, dict) else {}
    event_type = str(message.get("eventType") or "unknown")
    event_key = str(message.get("eventKey") or "")
    from_user = str(message.get("fromUser") or "")
    fallback_to_success = reply.get("fallbackToSuccess") is True
    fallback_reason = str(reply.get("reason") or "")

    if event_key.startswith("AI:"):
        json.dump(
            {
                "ok": True,
                "action": "none",
                "chainToAgent": True,
                "audit": {
                    "tags": ["passive-reply", "post", "chain-ai", event_type],
                },
            },
            sys.stdout,
            ensure_ascii=False,
        )
        return 0

    lines = ["模板卡片事件已进入后处理。"]
    if from_user:
        lines.append(f"用户: {from_user}")
    if event_key:
        lines.append(f"事件: {event_key}")
    if fallback_to_success:
        lines.append(f"回包状态: 已降级为 success ({fallback_reason or 'unknown'})")
    else:
        lines.append("回包状态: 被动回复已成功发出")

    json.dump(
        {
            "ok": True,
            "action": "reply_text",
            "reply": {
                "text": "\n".join(lines),
            },
            "chainToAgent": False,
            "audit": {
                "tags": [
                    "passive-reply",
                    "post",
                    "fallback-success" if fallback_to_success else "passive-sent",
                    event_type,
                ],
            },
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())