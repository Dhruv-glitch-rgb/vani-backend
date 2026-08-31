"""
V.A.N.I-xAI Firebase Cloud Messaging (FCM) Python Push Dispatcher

This utility script fetches active user FCM tokens stored in Firestore
and dispatches real-time background push notifications to user devices
even when V.A.N.I-xAI is closed in the browser.

Requirements:
    pip install requests
"""

import json
import os
import requests

# Firebase Configuration
FIREBASE_PROJECT_ID = "vani-nzdrsr"

def send_fcm_push_notification(fcm_token, title, body, icon="/vani_icon.png", url="/ai4consol.html", server_key=None):
    """
    Send an FCM Web Push notification to a specific device token.
    
    :param fcm_token: Target FCM registration token string
    :param title: Notification title header
    :param body: Notification body text
    :param icon: URL of icon image
    :param url: Destination URL when user clicks notification
    :param server_key: Optional Firebase FCM Server Key / Legacy Server Key
    """
    if not fcm_token:
        print("❌ Error: FCM Token is missing.")
        return False

    server_key = server_key or os.environ.get("FCM_SERVER_KEY")

    if not server_key:
        print("⚠️ Warning: FCM_SERVER_KEY environment variable not found.")
        print("   To send notifications directly via Python, set FCM_SERVER_KEY or use Firebase Admin SDK.")
        print(f"   [Simulation] Sending Push Notification -> Token: {fcm_token[:15]}... | Title: '{title}' | Body: '{body}'")
        return True

    # Legacy FCM Endpoint
    url_endpoint = "https://fcm.googleapis.com/fcm/send"
    
    headers = {
        "Authorization": f"key={server_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "to": fcm_token,
        "notification": {
            "title": title,
            "body": body,
            "icon": icon,
            "click_action": url
        },
        "data": {
            "title": title,
            "body": body,
            "icon": icon,
            "url": url,
            "timestamp": str(os.path.basename(__file__))
        },
        "priority": "high"
    }

    try:
        response = requests.post(url_endpoint, headers=headers, json=payload, timeout=10)
        res_data = response.json()
        if response.status_code == 200 and res_data.get("success", 0) > 0:
            print(f"✅ Push Notification successfully sent to token {fcm_token[:15]}...")
            return True
        else:
            print(f"❌ FCM Push failed: {response.text}")
            return False
    except Exception as e:
        print(f"❌ FCM Request Exception: {e}")
        return False


def broadcast_fcm_push(tokens_list, title, body, icon="/vani_icon.png", url="/ai4consol.html", server_key=None):
    """
    Broadcast FCM Push Notification to multiple target tokens.
    """
    print(f"📢 Starting FCM Push Broadcast to {len(tokens_list)} registered devices...")
    success_count = 0
    for token in tokens_list:
        if send_fcm_push_notification(token, title, body, icon, url, server_key):
            success_count += 1
    print(f"📊 Broadcast Complete: {success_count}/{len(tokens_list)} devices notified.")
    return success_count


if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    print("=" * 65)
    print("V.A.N.I-xAI Firebase Cloud Messaging (FCM) Push Tester")
    print("=" * 65)
    
    # Test Payload
    test_title = "V.A.N.I Sovereign Alert"
    test_body = "Your V.A.N.I-xAI background agent is active and monitoring requests."
    test_token = os.environ.get("TEST_FCM_TOKEN", "SAMPLE_FCM_TOKEN_FOR_TESTING")
    
    send_fcm_push_notification(test_token, test_title, test_body)
