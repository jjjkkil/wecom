#!/usr/bin/env python3
import json
import sys
import time


def cdata(value: object) -> str:
    text = str(value or "")
    return f"<![CDATA[{text.replace(']]>', ']]]]><![CDATA[>')}]]>"


def build_text_reply_xml(to_user: str, from_user: str, create_time: int, content: str) -> str:
    return "\n".join(
        [
            "<xml>",
            f"  <ToUserName>{cdata(to_user)}</ToUserName>",
            f"  <FromUserName>{cdata(from_user)}</FromUserName>",
            f"  <CreateTime>{create_time}</CreateTime>",
            "  <MsgType><![CDATA[text]]></MsgType>",
            f"  <Content>{cdata(content)}</Content>",
            "</xml>",
        ]
    )


def build_update_button_xml(to_user: str, from_user: str, create_time: int, replace_name: str) -> str:
    return "\n".join(
        [
            "<xml>",
            f"  <ToUserName>{cdata(to_user)}</ToUserName>",
            f"  <FromUserName>{cdata(from_user)}</FromUserName>",
            f"  <CreateTime>{create_time}</CreateTime>",
            "  <MsgType><![CDATA[update_button]]></MsgType>",
            "  <Button>",
            f"    <ReplaceName>{cdata(replace_name)}</ReplaceName>",
            "  </Button>",
            "</xml>",
        ]
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        json.dump(
            {
                "ok": False,
                "responseMode": "passive_reply",
                "error": "invalid input payload",
            },
            sys.stdout,
            ensure_ascii=False,
        )
        return 0

    message = payload.get("message", {}) if isinstance(payload, dict) else {}
    event_type = str(message.get("eventType") or "")
    event_key = str(message.get("eventKey") or "")
    from_user = str(message.get("fromUser") or "")
    corp_id = str(message.get("toUser") or "")
    create_time = int(time.time())

    skip_post_reply_handler = event_key.startswith("NO_POST:")

    if event_type == "template_card_event" and from_user and corp_id:
        reply_message = build_update_button_xml(
            to_user=from_user,
            from_user=corp_id,
            create_time=create_time,
            replace_name="已完成" if event_key.startswith("DONE:") else "已提交，处理中",
        )
    else:
        reply_message = build_text_reply_xml(
            to_user=from_user or "unknown-user",
            from_user=corp_id or "wecom-app",
            create_time=create_time,
            content=f"已收到事件 {event_key}，正在处理中。" if event_key else "已收到事件，正在处理中。",
        )

    json.dump(
        {
            "ok": True,
            "responseMode": "passive_reply",
            "replyMessage": reply_message,
            "skipPostReplyHandler": skip_post_reply_handler,
            "audit": {
                "tags": ["passive-reply", "template-card", event_type or "unknown"],
            },
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())