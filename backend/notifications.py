"""
IBVAP Sentinel — backend/notifications.py

ONE job: remember which mobile devices want push alerts, by storing their
Firebase Cloud Messaging (FCM) token.

This module does NOT talk to Firebase and does NOT send any notification —
it only saves the token so a separate (future) sender process could use it.
That means no Firebase credentials or internet connection are needed just
to run this backend locally.
"""

from backend import database


def register_token(token: str, device_id: str, platform: str) -> dict:
    """Save a device's push token. Registering the same token again just
    refreshes its device_id/platform/registered_at."""
    database.insert_fcm_token(token, device_id, platform)
    return {"status": "registered", "token": token, "device_id": device_id, "platform": platform}


def registered_device_count() -> int:
    return len(database.get_all_fcm_tokens())
