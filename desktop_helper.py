import os
import subprocess
import time
import re

try:
    import pyautogui
    # Adjust PyAutoGUI settings for safety
    pyautogui.FAILSAFE = False  # Disabled to prevent corner lock crashes
    pyautogui.PAUSE = 0.5      # Add pause between automation steps
except Exception:
    pyautogui = None

from logger import log_status as logger_log

def log_status(message):
    logger_log('DESKTOP', message)

# Standard app mapping
APP_MAP = {
    'notepad': 'notepad.exe',
    'calculator': 'calc.exe',
    'calc': 'calc.exe',
    'chrome': 'chrome.exe',
    'explorer': 'explorer.exe',
    'file explorer': 'explorer.exe',
    'paint': 'mspaint.exe',
    'wordpad': 'write.exe',
    'cmd': 'cmd.exe',
    'powershell': 'powershell.exe',
    'browser': 'chrome.exe'
}

def open_desktop_app(app_name):
    """Open a desktop application on Windows."""
    name_clean = app_name.lower().strip()
    log_status(f"Opening desktop app: '{name_clean}'")
    
    # Try APP_MAP first
    exe = APP_MAP.get(name_clean, name_clean)
    
    try:
        if exe.endswith('.exe') or exe in APP_MAP.values():
            import os
            try:
                os.startfile(exe)
                return f"Opened {app_name}."
            except Exception as se:
                log_status(f"Direct startfile failed for '{exe}', trying subprocess: {se}")
                subprocess.Popen(exe)
                return f"Opened {app_name}."
        else:
            # Try to start it using Windows shell start command (handles schemes and general shortcuts)
            # E.g. start excel, start winword, start ms-settings:
            subprocess.Popen(f"start {exe}", shell=True)
            return f"Attempted to open {app_name} via Windows Shell."
    except Exception as e:
        log_status(f"Error opening desktop app '{app_name}': {e}")
        # Try a direct start command in PowerShell
        try:
            subprocess.Popen(["powershell", "-Command", f"Start-Process {exe}"], shell=True)
            return f"Attempted to open {app_name} via PowerShell."
        except Exception as ex:
            return f"Failed to open {app_name}. Error: {ex}"

def use_desktop_app(action, value=None):
    """
    Automate desktop user interface interactions.
    Supported actions: 'type', 'press', 'hotkey', 'click', 'double_click', 'wait'
    """
    log_status(f"Executing desktop automation: action={action}, value={value}")
    try:
        # Move mouse slightly if currently in a screen corner to prevent PyAutoGUI fail-safe exception
        mx, my = pyautogui.position()
        width, height = pyautogui.size()
        if mx == 0 or my == 0 or mx >= width - 2 or my >= height - 2:
            log_status("Mouse detected in corner. Moving mouse slightly to prevent fail-safe trigger...")
            pyautogui.moveTo(100, 100)
        if action == 'type':
            if value:
                # Replace common literal representations of keys with real actions if any,
                # but typewrite is mostly for strings.
                pyautogui.typewrite(str(value), interval=0.01)
                return f"Typed: '{value}'"
            return "No text specified to type."
            
        elif action == 'press':
            if value:
                key = str(value).lower().strip()
                pyautogui.press(key)
                return f"Pressed key: '{key}'"
            return "No key specified to press."
            
        elif action == 'hotkey':
            if value:
                # Value can be a list or a string separated by '+' or ','
                keys = []
                if isinstance(value, str):
                    keys = [k.strip().lower() for k in value.replace('+', ',').split(',')]
                elif isinstance(value, list):
                    keys = [str(k).strip().lower() for k in value]
                
                if keys:
                    pyautogui.hotkey(*keys)
                    return f"Executed hotkey: {', '.join(keys)}"
            return "No keys specified for hotkey."
            
        elif action == 'click':
            if value:
                # Parse coordinate "x, y"
                coords = str(value).replace(' ', '').split(',')
                if len(coords) == 2:
                    x = int(coords[0])
                    y = int(coords[1])
                    pyautogui.click(x, y)
                    return f"Clicked at coordinates: ({x}, {y})"
            # Generic click at current mouse position
            pyautogui.click()
            return "Clicked at current position."
            
        elif action == 'double_click':
            if value:
                coords = str(value).replace(' ', '').split(',')
                if len(coords) == 2:
                    x = int(coords[0])
                    y = int(coords[1])
                    pyautogui.doubleClick(x, y)
                    return f"Double-clicked at coordinates: ({x}, {y})"
            pyautogui.doubleClick()
            return "Double-clicked at current position."
            
        elif action == 'wait':
            secs = float(value) if value else 1.0
            time.sleep(secs)
            return f"Waited for {secs} seconds."
            
        else:
            return f"Unknown desktop automation action: '{action}'"
            
    except Exception as e:
        log_status(f"Error during desktop automation: {e}")
        return f"Desktop automation error: {e}"

def make_desktop_whatsapp_call(phone_number, call_type='voice'):
    """Launch WhatsApp Desktop and initiate a voice or video call via keyboard shortcuts."""
    log_status(f"Initiating Desktop WhatsApp {call_type} call to {phone_number}")
    clean_number = re.sub(r'\D', '', phone_number)
    
    try:
        # Open WhatsApp Desktop conversation
        os.startfile(f"whatsapp://send?phone={clean_number}")
        time.sleep(4) # Wait for conversation to focus
        
        if call_type == 'video':
            log_status("Triggering Desktop WhatsApp Video Call (Ctrl+Shift+V)")
            pyautogui.hotkey('ctrl', 'shift', 'v')
        else:
            log_status("Triggering Desktop WhatsApp Voice Call (Ctrl+Shift+C)")
            pyautogui.hotkey('ctrl', 'shift', 'c')
            
        return f"Initiated Desktop WhatsApp {call_type} call to {phone_number}."
    except Exception as e:
        log_status(f"Error starting Desktop WhatsApp call: {e}")
        return f"Failed to start Desktop WhatsApp call: {e}"

def send_desktop_whatsapp_message(phone_number, message_text):
    """Launch WhatsApp Desktop, pre-fill custom text, and press enter to send."""
    log_status(f"Sending Desktop WhatsApp message to {phone_number}: '{message_text}'")
    clean_number = re.sub(r'\D', '', phone_number)
    
    try:
        import urllib.parse
        encoded_msg = urllib.parse.quote(message_text)
        uri = f"whatsapp://send?phone={clean_number}&text={encoded_msg}"
        os.startfile(uri)
        time.sleep(4) # Wait for conversation to focus
        
        log_status("Pressing Enter to send Desktop WhatsApp message...")
        pyautogui.press('enter')
        return f"Sent Desktop WhatsApp message to {phone_number}."
    except Exception as e:
        log_status(f"Error sending Desktop WhatsApp message: {e}")
        return f"Failed to send Desktop WhatsApp message: {e}"

def take_desktop_screenshot():
    """Capture a full screenshot of the desktop, save it to the static folder, and return its URL."""
    log_status("Taking desktop screenshot...")
    try:
        # Ensure static/screenshots directory exists
        screenshots_dir = os.path.join(os.path.dirname(__file__), 'static', 'screenshots')
        os.makedirs(screenshots_dir, exist_ok=True)
        
        filename = f"screenshot_{int(time.time())}.png"
        filepath = os.path.join(screenshots_dir, filename)
        
        # Capture using pyautogui
        screenshot = pyautogui.screenshot()
        screenshot.save(filepath)
        
        url = f"/static/screenshots/{filename}"
        log_status(f"Screenshot saved successfully: {url}")
        return {
            'success': True,
            'image_url': url,
            'message': "Desktop screenshot captured successfully."
        }
    except Exception as e:
        log_status(f"Failed to capture desktop screenshot: {e}")
        return {
            'success': False,
            'message': f"Failed to capture screenshot: {e}"
        }

def close_desktop_app(app_name):
    """Close a desktop application by running taskkill."""
    name_clean = app_name.lower().strip()
    log_status(f"Closing desktop app: '{name_clean}'")
    
    # Map common names to executable name if not ending in .exe
    exe = APP_MAP.get(name_clean, name_clean)
    if not exe.endswith('.exe'):
        exe = f"{exe}.exe"
        
    try:
        # /F: Force, /IM: Image name
        cmd = f"taskkill /f /im {exe}"
        subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
        return f"Closed application {exe}."
    except subprocess.CalledProcessError as e:
        try:
            cmd = f"taskkill /f /im {name_clean}.exe"
            subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
            return f"Closed application {name_clean}.exe."
        except Exception as ex:
            log_status(f"Taskkill failed for '{exe}' / '{name_clean}': {e.stderr.strip()}")
            return f"Failed to close {app_name}. (Process might not be running)."

def lock_windows():
    """Lock the Windows workstation."""
    log_status("Locking Windows workstation...")
    try:
        subprocess.run("rundll32.exe user32.dll,LockWorkStation", shell=True, check=True)
        return "Windows workstation locked."
    except Exception as e:
        log_status(f"Failed to lock Windows: {e}")
        return f"Failed to lock Windows: {e}"

def set_volume(action):
    """Adjust volume using keyboard key events."""
    log_status(f"Adjusting volume: {action}")
    try:
        if action == 'mute':
            pyautogui.press('volumemute')
            return "Volume muted/unmuted."
        elif action == 'up':
            for _ in range(5):
                pyautogui.press('volumeup')
            return "Volume increased."
        elif action == 'down':
            for _ in range(5):
                pyautogui.press('volumedown')
            return "Volume decreased."
        else:
            return f"Unknown volume action: {action}"
    except Exception as e:
        log_status(f"Failed to adjust volume: {e}")
        return f"Failed to adjust volume: {e}"

def open_url(url):
    """Open a URL in default browser."""
    log_status(f"Opening URL: {url}")
    clean_url = url.strip()
    if not clean_url.startswith(('http://', 'https://')):
        clean_url = f"https://{clean_url}"
        
    try:
        import os
        try:
            os.startfile(clean_url)
            return f"Opened URL {clean_url}."
        except Exception:
            subprocess.Popen(f"start {clean_url}", shell=True)
            return f"Opened URL {clean_url} via shell."
    except Exception as e:
        log_status(f"Failed to open URL '{url}': {e}")
        return f"Failed to open URL: {e}"
