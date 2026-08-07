import os
import sys
import threading
from collections import deque
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import adb_helper
import desktop_helper
import nlp_parser
import memory_manager

# Setup flask app
# Ensure template and static folders are loaded from correct directories
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__, 
    template_folder=os.path.join(WORKSPACE_DIR, 'templates'), 
    static_folder=os.path.join(WORKSPACE_DIR, 'static')
)
CORS(app)

@app.after_request
def add_pna_header(response):
    response.headers['Access-Control-Allow-Private-Network'] = 'true'
    return response

import logger

def add_log(msg):
    logger.log_status('SYSTEM', msg)

# Route: Serve UI
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/auth-vani-xai.html')
def auth():
    return render_template('auth-vani-xai.html')

# Endpoint: Check ADB Status
@app.route('/api/adb/status', methods=['GET'])
def adb_status():
    connected = adb_helper.is_device_connected()
    devices = adb_helper.list_devices()
    return jsonify({
        'connected': connected,
        'devices': devices
    })

# Endpoint: Run command
@app.route('/api/command', methods=['POST'])
def handle_command():
    data = request.json or {}
    command = data.get('command', '').strip()
    api_key = data.get('api_key', '').strip()

    if not command:
        return jsonify({'error': 'No command provided'}), 400

    add_log(f"Received Command: '{command}'")
    
    # Store user command in memory
    memory_manager.add_message('user', command)
    
    # Parse the command
    parsed = nlp_parser.parse_command(command, api_key)
    action = parsed.get('action')
    
    result_message = ""
    success = True

    try:
        if action == 'open_desktop_app':
            app_name = parsed.get('app_name')
            add_log(f"Running desktop execution: Open app '{app_name}'")
            result_message = desktop_helper.open_desktop_app(app_name)

        elif action == 'use_desktop_app':
            desktop_action = parsed.get('desktop_action')
            value = parsed.get('value')
            add_log(f"Running desktop automation: {desktop_action} ('{value}')")
            result_message = desktop_helper.use_desktop_app(desktop_action, value)

        elif action == 'open_mobile_app':
            package_name = parsed.get('package_name')
            if adb_helper.is_device_connected():
                add_log(f"Running mobile execution: Open package '{package_name}'")
                result = adb_helper.open_mobile_app(package_name)
                result_message = f"Mobile app opened. System output: {result}"
            else:
                success = False
                result_message = "No Android device connected. Please connect a device via USB with USB debugging enabled."

        elif action == 'close_mobile_app':
            package_name = parsed.get('package_name')
            if adb_helper.is_device_connected():
                add_log(f"Running mobile execution: Close package '{package_name}'")
                result = adb_helper.close_mobile_app(package_name)
                result_message = f"Closed mobile app '{package_name}'."
            else:
                success = False
                result_message = "No Android device connected."

        elif action == 'make_phone_call':
            phone_number = parsed.get('phone_number')
            if adb_helper.is_device_connected():
                add_log(f"Running mobile execution: Make phone call to '{phone_number}'")
                result = adb_helper.make_phone_call(phone_number)
                result_message = f"Phone call triggered on mobile. System output: {result}"
            else:
                success = False
                result_message = "No Android device connected."

        elif action == 'make_whatsapp_call':
            phone_number = parsed.get('phone_number')
            call_type = parsed.get('call_type', 'voice')
            target = parsed.get('target')
            if target == 'mobile' or (target != 'desktop' and adb_helper.is_device_connected()):
                add_log(f"Running mobile execution: Make WhatsApp {call_type} call to '{phone_number}'")
                result_message = adb_helper.make_whatsapp_call(phone_number, call_type)
            else:
                add_log(f"Running desktop execution: Make WhatsApp {call_type} call to '{phone_number}'")
                result_message = desktop_helper.make_desktop_whatsapp_call(phone_number, call_type)

        elif action == 'send_whatsapp_message':
            phone_number = parsed.get('phone_number')
            message_text = parsed.get('message_text')
            target = parsed.get('target')
            if target == 'mobile' or (target != 'desktop' and adb_helper.is_device_connected()):
                add_log(f"Running mobile execution: Send WhatsApp message to '{phone_number}'")
                result_message = adb_helper.send_whatsapp_message(phone_number, message_text)
            else:
                add_log(f"Running desktop execution: Send WhatsApp message to '{phone_number}'")
                result_message = desktop_helper.send_desktop_whatsapp_message(phone_number, message_text)

        elif action == 'take_screenshot':
            add_log("Running desktop execution: Capture screenshot")
            result_message = desktop_helper.take_desktop_screenshot()
            if isinstance(result_message, dict) and not result_message.get('success', True):
                success = False

        elif action == 'take_mobile_screenshot':
            if adb_helper.is_device_connected():
                add_log("Running mobile execution: Capture screenshot")
                result_message = adb_helper.take_mobile_screenshot()
                if isinstance(result_message, dict) and not result_message.get('success', True):
                    success = False
            else:
                success = False
                result_message = "No Android device connected to capture screenshot."

        elif action == 'lock_windows':
            add_log("Running desktop execution: Lock workstation")
            result_message = desktop_helper.lock_windows()

        elif action == 'set_volume':
            vol_action = parsed.get('volume_action', 'mute')
            add_log(f"Running desktop execution: Adjust volume ({vol_action})")
            result_message = desktop_helper.set_volume(vol_action)

        elif action == 'open_url':
            url_val = parsed.get('url')
            add_log(f"Running desktop execution: Open URL '{url_val}'")
            result_message = desktop_helper.open_url(url_val)

        elif action == 'swipe_mobile':
            direction = parsed.get('direction', 'up')
            if adb_helper.is_device_connected():
                add_log(f"Running mobile execution: Swipe {direction}")
                result_message = adb_helper.swipe_mobile(direction)
            else:
                success = False
                result_message = "No Android device connected to swipe."

        elif action == 'press_mobile_key':
            key = parsed.get('key', 'home')
            if adb_helper.is_device_connected():
                add_log(f"Running mobile execution: Press key {key}")
                result_message = adb_helper.press_mobile_key(key)
            else:
                success = False
                result_message = "No Android device connected to press key."

        elif action == 'type_mobile_text':
            type_text = parsed.get('text', '')
            if adb_helper.is_device_connected():
                add_log(f"Running mobile execution: Type text '{type_text}'")
                result_message = adb_helper.type_mobile_text(type_text)
            else:
                success = False
                result_message = "No Android device connected to type text."

        elif action == 'analyze_screen':
            add_log("Running vision execution: Analyze screen")
            screen_data = desktop_helper.take_desktop_screenshot()
            if isinstance(screen_data, dict) and screen_data.get('success'):
                img_url = screen_data.get('image_url')
                import base64
                import urllib.request
                import json
                filepath = os.path.join(WORKSPACE_DIR, img_url.lstrip('/'))
                with open(filepath, "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                
                vision_prompt = command
                # Use the API key provided by the frontend, or fall back to an environment variable
                use_key = api_key if api_key else os.environ.get("OPENROUTER_API_KEY", "")
                
                req = urllib.request.Request(
                    url="https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {use_key}",
                        "Content-Type": "application/json"
                    },
                    data=json.dumps({
                        "model": "google/gemini-flash-1.5-8b",
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": vision_prompt},
                                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_string}"}}
                                ]
                            }
                        ]
                    }).encode('utf-8')
                )
                try:
                    with urllib.request.urlopen(req, timeout=30) as response:
                        v_data = json.loads(response.read().decode('utf-8'))
                        result_message = v_data['choices'][0]['message']['content'].strip()
                        success = True
                except Exception as e:
                    success = False
                    result_message = f"Vision API failed: {e}"
            else:
                success = False
                result_message = "Failed to capture screenshot for analysis."

        elif action == 'execute_python_script':
            script = parsed.get('script', '')
            add_log(f"Running execution sandbox: Python script")
            import subprocess
            temp_path = os.path.join(WORKSPACE_DIR, 'temp_exec.py')
            with open(temp_path, 'w', encoding='utf-8') as f:
                f.write(script)
            try:
                output = subprocess.check_output(['python', temp_path], stderr=subprocess.STDOUT, timeout=10, text=True)
                result_message = f"Script Output:\\n{output.strip()}"
                success = True
            except subprocess.TimeoutExpired:
                success = False
                result_message = "Script execution timed out after 10 seconds."
            except subprocess.CalledProcessError as e:
                success = False
                result_message = f"Script execution failed:\\n{e.output.strip()}"
            except Exception as e:
                success = False
                result_message = f"Failed to execute script: {e}"
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        elif action == 'chat':
            success = True
            result_message = parsed.get('message', 'No response generated.')

        elif action == 'unknown':
            success = True
            result_message = parsed.get('message', "Command not recognized.")

        else:
            success = False
            result_message = f"Unsupported action: '{action}'."

    except Exception as e:
        success = False
        result_message = f"Execution failed: {e}"
        add_log(f"Error executing action: {e}")

    add_log(f"Result: {result_message}")
    
    # Store assistant response in memory if it's a valid string message
    if success and isinstance(result_message, str) and result_message.strip():
        memory_manager.add_message('assistant', result_message)
    
    response_data = {
        'success': success,
        'action': action,
        'parsed': parsed,
        'message': result_message
    }
    
    if isinstance(result_message, dict):
        # Flatten dictionary response fields (e.g. success, image_url, message)
        response_data.update(result_message)
        
    return jsonify(response_data)

# Endpoint: Get logs
@app.route('/api/logs', methods=['GET'])
def get_logs_endpoint():
    logs_list = logger.get_logs()
    return jsonify({
        'logs': logs_list
    })

@app.route('/terms')
def terms_page():
    return render_template('terms.html')

@app.route('/privacy')
def privacy_page():
    return render_template('privacy.html')

@app.route('/faq')
def faq_page():
    return render_template('faq.html')

@app.route('/about-founder')
def about_founder_page():
    return render_template('about_founder.html')

@app.route('/about-developer')
def about_developer_page():
    return render_template('about_developer.html')

if __name__ == '__main__':
    # Initialize ADB download/setup in a background thread so server starts instantly
    threading.Thread(target=adb_helper.ensure_adb, daemon=True).start()
    
    # Run Flask server locally
    app.run(host='127.0.0.1', port=5000, debug=True)
