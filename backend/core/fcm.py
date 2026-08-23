"""Firebase Cloud Messaging (FCM) push sending.

Gracefully no-ops when FIREBASE_SERVICE_ACCOUNT_JSON is unset/invalid so the
app never fails to start. Used by the shared notification system for both the
web app and the future Android app.
"""
import json
import logging
import os

logger = logging.getLogger(__name__)

_fcm_app = None
_init_tried = False


def init_fcm() -> bool:
    global _fcm_app, _init_tried
    if _init_tried:
        return _fcm_app is not None
    _init_tried = True
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        logger.warning("FCM unconfigured; push sending disabled (in-app notifications still work)")
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials
        service_account = json.loads(raw)
        _fcm_app = firebase_admin.initialize_app(credentials.Certificate(service_account))
        logger.info("FCM initialized")
        return True
    except Exception as e:
        logger.error(f"Invalid Firebase credentials; push disabled: {e}")
        _fcm_app = None
        return False


def configured() -> bool:
    return _fcm_app is not None


def _is_dead_token(exc) -> bool:
    code = getattr(exc, "code", "")
    return code in {
        "messaging/invalid-registration-token",
        "messaging/registration-token-not-registered",
    }


async def send_to_tokens(tokens, title, body, data=None, image=None) -> dict:
    """Send a combined notification+data message to up to 500 tokens.

    The `notification` block lets Android display a tray notification while the
    app is backgrounded/closed; `data` carries the deep link for tap handling.
    Returns removed (dead) tokens so callers can prune them.
    """
    if not configured() or not tokens:
        return {"configured": configured(), "success_count": 0,
                "failure_count": 0, "removed_tokens": []}
    import asyncio
    from firebase_admin import messaging

    safe_data = {str(k): str(v) for k, v in (data or {}).items() if v is not None}

    def _send_chunk(chunk):
        msg = messaging.MulticastMessage(
            tokens=chunk,
            notification=messaging.Notification(title=title, body=body, image=image or None),
            data=safe_data,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id="default", click_action="OPEN_APP",
                    image=image or None,
                ),
            ),
        )
        return messaging.send_each_for_multicast(msg, app=_fcm_app)

    success = failure = 0
    removed = []
    try:
        for i in range(0, len(tokens), 500):
            chunk = tokens[i:i + 500]
            result = await asyncio.to_thread(_send_chunk, chunk)
            success += result.success_count
            failure += result.failure_count
            removed += [t for t, r in zip(chunk, result.responses)
                        if not r.success and _is_dead_token(r.exception)]
    except Exception as e:
        logger.error(f"FCM send failed: {e}")
        return {"configured": True, "success_count": success,
                "failure_count": failure or len(tokens), "removed_tokens": removed}
    return {"configured": True, "success_count": success,
            "failure_count": failure, "removed_tokens": removed}
