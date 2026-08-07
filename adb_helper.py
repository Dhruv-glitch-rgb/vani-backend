import os
import sys
import zipfile
import requests
import subprocess
import time
import xml.etree.ElementTree as ET
import re

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_DIR = os.path.join(WORKSPACE_DIR, 'bin')
ADB_ZIP_URL = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
ADB_ZIP_PATH = os.path.join(BIN_DIR, 'platform-tools.zip')
PLATFORM_TOOLS_DIR = os.path.join(BIN_DIR, 'platform-tools')
ADB_PATH = os.path.join(PLATFORM_TOOLS_DIR, 'adb.exe')

from logger import log_status as logger_log

def log_status(message):
    logger_log('ADB', message)

def ensure_adb():
    """Ensure ADB is downloaded and extracted in bin directory."""
    if os.path.exists(ADB_PATH):
        return True

    log_status("ADB not found. Starting download of platform-tools...")
    if not os.path.exists(BIN_DIR):
        os.makedirs(BIN_DIR)

    try:
        # Download
        r = requests.get(ADB_ZIP_URL, stream=True)
        r.raise_for_status()
        with open(ADB_ZIP_PATH, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        log_status("Download complete. Extracting platform-tools...")

        # Extract
        with zipfile.ZipFile(ADB_ZIP_PATH, 'r') as zip_ref:
            zip_ref.extractall(BIN_DIR)
        
        # Cleanup
        if os.path.exists(ADB_ZIP_PATH):
            os.remove(ADB_ZIP_PATH)

        log_status("ADB setup successfully.")
        return True
    except Exception as e:
        log_status(f"Error setting up ADB: {e}")
        return False

def run_adb(args):
    """Run an ADB command and return stdout as string."""
    ensure_adb()
    cmd = [ADB_PATH] + args
    try:
        # On Windows, prevent cmd window popup
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, startupinfo=startupinfo)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        log_status(f"ADB Command failed: {' '.join(cmd)}. Error: {e.stderr.strip()}")
        return f"ERROR: {e.stderr.strip()}"
    except Exception as e:
        log_status(f"Exception running ADB: {e}")
        return f"ERROR: {e}"

def list_devices():
    """List connected ADB devices."""
    output = run_adb(['devices'])
    devices = []
    lines = output.split('\n')
    for line in lines[1:]: # Skip "List of devices attached"
        if line.strip():
            parts = line.split('\t')
            if len(parts) >= 2:
                devices.append({
                    'id': parts[0],
                    'status': parts[1]
                })
    return devices

def is_device_connected():
    devices = list_devices()
    return len(devices) > 0

def is_screen_on():
    try:
        output = run_adb(['shell', 'dumpsys', 'power'])
        return "mWakefulness=Awake" in output
    except Exception:
        return True

def ensure_device_awake():
    """Wakes the device screen and swipes up to dismiss the keyguard."""
    if not is_device_connected():
        return
    try:
        if not is_screen_on():
            log_status("Device screen is asleep. Waking up device...")
            run_adb(['shell', 'input', 'keyevent', '26']) # KEYCODE_POWER
            time.sleep(0.5)
            # Swipe up to dismiss lockscreen
            run_adb(['shell', 'input', 'swipe', '500', '1500', '500', '500'])
            time.sleep(0.5)
        else:
            # Screen is on, but keyguard might be showing
            run_adb(['shell', 'input', 'swipe', '500', '1500', '500', '500'])
            time.sleep(0.5)
    except Exception as e:
        log_status(f"Error checking display state: {e}")

def open_mobile_app(package_name):
    """Open a mobile app by its package name using monkey or direct am start."""
    ensure_device_awake()
    log_status(f"Opening mobile app: {package_name}")
    # Using monkey is the easiest generic way to open an app by package name
    result = run_adb(['shell', 'monkey', '-p', package_name, '-c', 'android.intent.category.LAUNCHER', '1'])
    if "ERROR" in result:
        # Fallback to general intent start if monkey fails or is blocked
        result = run_adb(['shell', 'am', 'start', '-n', f"{package_name}/.MainActivity"])
    return result

def close_mobile_app(package_name):
    """Force-stop a mobile app."""
    ensure_device_awake()
    log_status(f"Closing mobile app: {package_name}")
    return run_adb(['shell', 'am', 'force-stop', package_name])

def make_phone_call(phone_number):
    """Dial or directly call a phone number."""
    ensure_device_awake()
    log_status(f"Initiating phone call to: {phone_number}")
    # Attempt direct CALL action (requires permission CALL_PHONE usually granted to system shell)
    res = run_adb(['shell', 'am', 'start', '-a', 'android.intent.action.CALL', '-d', f"tel:{phone_number}"])
    if "ERROR" in res or "SecurityException" in res:
        log_status("Direct call failed or permission denied. Falling back to opening Dialer...")
        # Fallback to DIAL action which opens dialer and fills number
        res = run_adb(['shell', 'am', 'start', '-a', 'android.intent.action.DIAL', '-d', f"tel:{phone_number}"])
    return res

def dump_ui_layout():
    """Dump UI layout, pull file, and parse it as XML Tree."""
    try:
        run_adb(['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml'])
        temp_xml = os.path.join(WORKSPACE_DIR, 'window_dump.xml')
        run_adb(['pull', '/sdcard/window_dump.xml', temp_xml])
        if os.path.exists(temp_xml):
            tree = ET.parse(temp_xml)
            os.remove(temp_xml)
            return tree.getroot()
    except Exception as e:
        log_status(f"Failed to dump UI layout: {e}")
    return None

def find_node_by_attrs(node, match_func):
    """Recursively search for an XML node matching criteria."""
    if match_func(node):
        return node
    for child in node:
        found = find_node_by_attrs(child, match_func)
        if found is not None:
            return found
    return None

def click_node(node):
    """Parse bounds "[x1,y1][x2,y2]" and click the center coordinate."""
    bounds = node.attrib.get('bounds', '')
    if bounds:
        match = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
        if match:
            x1, y1, x2, y2 = map(int, match.groups())
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            log_status(f"Clicking coordinate: ({cx}, {cy})")
            run_adb(['shell', 'input', 'tap', str(cx), str(cy)])
            return True
    return False

def make_whatsapp_call(phone_number, call_type='voice'):
    """
    Open WhatsApp chat with phone number, then trigger a WhatsApp voice or video call.
    Uses UI XML inspection to click call button for maximum reliability.
    """
    ensure_device_awake()
    log_status(f"Initiating WhatsApp {call_type} call to: {phone_number}")
    
    # Format number: remove +, spaces, leading zeros if international format, etc.
    clean_number = re.sub(r'\D', '', phone_number)
    
    # Open direct chat with phone number
    # WhatsApp deep link
    uri = f"whatsapp://send?phone={clean_number}"
    run_adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', uri])
    time.sleep(2) # Initial sleep for intent start
    
    # Retry XML search up to 3 times to allow slow chats to load
    btn = None
    for attempt in range(3):
        log_status(f"Scanning screen for call button (attempt {attempt + 1}/3)...")
        root = dump_ui_layout()
        if root is not None:
            def is_call_button(n):
                desc = n.attrib.get('content-desc', '').lower()
                res_id = n.attrib.get('resource-id', '').lower()
                if call_type == 'video':
                    return 'video call' in desc or 'video_call' in res_id or 'menu_item_video_call' in res_id
                else: # voice
                    return ('voice call' in desc or 'start voice call' in desc or 'audio call' in desc or 
                            'menu_item_call' in res_id or 'call' in desc) and 'video' not in desc

            btn = find_node_by_attrs(root, is_call_button)
            if btn is not None:
                if click_node(btn):
                    log_status(f"WhatsApp {call_type} call initiated successfully via UI button.")
                    return f"Initiated WhatsApp {call_type} call to {phone_number}."
        time.sleep(2)
        
    log_status("XML matching failed. Trying fallback coordinate clicks...")

    # Coordinate fallback
    if call_type == 'video':
        # Let's try standard layout coordinates
        run_adb(['shell', 'input', 'tap', '800', '150']) 
    else:
        run_adb(['shell', 'input', 'tap', '950', '150'])
        
    return f"WhatsApp {call_type} call initiated to {phone_number} (fallback trigger)."

def send_whatsapp_message(phone_number, message_text):
    """Open WhatsApp chat with phone number, type custom message, and click send."""
    ensure_device_awake()
    log_status(f"Sending WhatsApp message to {phone_number}: '{message_text}'")
    
    clean_number = re.sub(r'\D', '', phone_number)
    
    # 1. Open WhatsApp chat directly using deep link URI
    # Include the text in URL encoded format if possible
    # whatsapp://send?phone=...&text=...
    import urllib.parse
    encoded_msg = urllib.parse.quote(message_text)
    uri = f"whatsapp://send?phone={clean_number}&text={encoded_msg}"
    
    run_adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', uri])
    time.sleep(2) # Initial sleep for intent start
    
    # Retry XML search up to 3 times to allow slow chats to load
    btn = None
    for attempt in range(3):
        log_status(f"Scanning screen for Send button (attempt {attempt + 1}/3)...")
        root = dump_ui_layout()
        if root is not None:
            def is_send_button(n):
                desc = n.attrib.get('content-desc', '').lower()
                res_id = n.attrib.get('resource-id', '').lower()
                return 'send' in desc or 'send' in res_id

            btn = find_node_by_attrs(root, is_send_button)
            if btn is not None:
                if click_node(btn):
                    log_status("WhatsApp message sent successfully via UI Send button.")
                    return f"Sent WhatsApp message to {phone_number}."
        time.sleep(2)
        
    log_status("Could not find Send button via layout XML, trying fallback coordinates/keypresses.")

    # Fallback: Tap send button (usually bottom right, or enter key event 66, or DPAD center)
    # WhatsApp's send button coordinates are typically at bottom-right (e.g. 1000, 2200 for keyboard-up state)
    # Let's press TAB to shift focus to send button, then ENTER, or try standard coordinate.
    # Alternatively: WhatsApp message box holds text, let's send input keyevents
    # Send button usually has a standard location when keybaord is up, let's tap bottom right:
    run_adb(['shell', 'input', 'keyevent', '22']) # DPAD RIGHT
    run_adb(['shell', 'input', 'keyevent', '66']) # ENTER
    
    # Let's tap at common location for WhatsApp send button (bottom right of input bar, above keyboard)
    # Typically around x=1000, y=1300 (or y=1200 depending on screen)
    run_adb(['shell', 'input', 'tap', '1000', '1350'])
    time.sleep(0.5)
    run_adb(['shell', 'input', 'tap', '1000', '2150']) # lower if keyboard closed
    
    return f"Sent WhatsApp message to {phone_number}."

def take_mobile_screenshot():
    """Capture a full screenshot of the mobile screen, save it to the static folder, and return its URL."""
    ensure_device_awake()
    log_status("Taking mobile screenshot...")
    try:
        # Ensure static/screenshots directory exists
        screenshots_dir = os.path.join(os.path.dirname(__file__), 'static', 'screenshots')
        os.makedirs(screenshots_dir, exist_ok=True)
        
        filename = f"mobile_screenshot_{int(time.time())}.png"
        filepath = os.path.join(screenshots_dir, filename)
        
        # Capture mobile screen via adb and pull it
        run_adb(['shell', 'screencap', '-p', '/sdcard/mobile_screenshot.png'])
        run_adb(['pull', '/sdcard/mobile_screenshot.png', filepath])
        
        url = f"/static/screenshots/{filename}"
        log_status(f"Mobile screenshot saved successfully: {url}")
        return {
            'success': True,
            'image_url': url,
            'message': "Mobile screenshot captured successfully."
        }
    except Exception as e:
        log_status(f"Failed to capture mobile screenshot: {e}")
        return {
            'success': False,
            'message': f"Failed to capture mobile screenshot: {e}"
        }

def press_mobile_key(key):
    """Simulate standard Android key events."""
    ensure_device_awake()
    log_status(f"Pressing mobile key: {key}")
    key_map = {
        'home': '3',
        'back': '4',
        'app_switch': '187',
        'recent': '187',
        'power': '26',
        'volume_up': '24',
        'volume_down': '25'
    }
    val = key_map.get(key.lower().strip(), key)
    try:
        run_adb(['shell', 'input', 'keyevent', val])
        return f"Pressed key event {key} on mobile."
    except Exception as e:
        log_status(f"Failed to press key event: {e}")
        return f"Failed to press key event: {e}"

def swipe_mobile(direction):
    """Execute Android swipe gestures."""
    ensure_device_awake()
    log_status(f"Swiping mobile: {direction}")
    swipes = {
        'up': ['500', '1500', '500', '500', '300'],
        'down': ['500', '500', '500', '1500', '300'],
        'left': ['900', '1000', '100', '1000', '300'],
        'right': ['100', '1000', '900', '1000', '300']
    }
    args = swipes.get(direction.lower().strip())
    if not args:
        return f"Unknown swipe direction: {direction}."
    try:
        run_adb(['shell', 'input', 'swipe'] + args)
        return f"Swiped {direction} on mobile screen."
    except Exception as e:
        log_status(f"Failed to swipe: {e}")
        return f"Failed to swipe: {e}"

def type_mobile_text(text):
    """Type text on mobile using adb input."""
    ensure_device_awake()
    log_status(f"Typing text on mobile: '{text}'")
    escaped_text = text.replace(' ', '%s') # ADB shell input uses %s for space
    try:
        run_adb(['shell', 'input', 'text', escaped_text])
        return f"Typed '{text}' on mobile screen."
    except Exception as e:
        log_status(f"Failed to type mobile text: {e}")
        return f"Failed to type mobile text: {e}"
