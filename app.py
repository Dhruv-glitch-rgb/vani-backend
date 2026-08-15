import os
import sys
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
import threading
from collections import deque
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import desktop_helper
import nlp_parser
import memory_manager
import autonomous_agent
import voice_agent
import agentic_loop
import psutil
import platform
import time

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


# Endpoint: Run command
@app.route('/api/command', methods=['POST'])
def handle_command():
    data = request.json or {}
    command = data.get('command', '').strip()

    if not command:
        return jsonify({'error': 'No command provided'}), 400

    add_log(f"Received Command: '{command}'")
    
    # Store user command in memory
    memory_manager.add_message('user', command)
    
    personality = data.get('personality', 'helpful')
    
    # Parse the command
    parsed = nlp_parser.parse_command(command, personality=personality)
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

        elif action == 'make_phone_call':
            success = True
            result_message = "Phone call handled by client browser."

        elif action == 'make_whatsapp_call':
            phone_number = parsed.get('phone_number')
            call_type = parsed.get('call_type', 'voice')
            add_log(f"Running desktop execution: Make WhatsApp {call_type} call to '{phone_number}'")
            result_message = desktop_helper.make_desktop_whatsapp_call(phone_number, call_type)

        elif action == 'send_whatsapp_message':
            phone_number = parsed.get('phone_number')
            message_text = parsed.get('message_text')
            add_log(f"Running desktop execution: Send WhatsApp message to '{phone_number}'")
            result_message = desktop_helper.send_desktop_whatsapp_message(phone_number, message_text)

        elif action == 'cross_device_whatsapp_paste':
            phone_number = parsed.get('phone_number')
            add_log(f"Running Swarm execution: Read PC clipboard and WhatsApp to '{phone_number}'")
            clipboard_text = desktop_helper.get_clipboard_text()
            if not clipboard_text.strip():
                success = False
                result_message = "Clipboard is empty or could not be read."
            else:
                add_log(f"Swarm: Sending clipboard via Desktop WhatsApp")
                result_message = desktop_helper.send_desktop_whatsapp_message(phone_number, clipboard_text)

        elif action == 'autonomous_goal':
            goal = parsed.get('goal', '')
            add_log(f"Running autonomous execution: Goal '{goal}'")
            result_message = agentic_loop.agent_loop.start_goal(goal)

        elif action == 'lockdown':
            add_log("Triggering Web Terminal Lockdown...")
            return jsonify({'success': True, 'action_type': 'lockdown', 'message': 'Terminal locked.'})

        elif action == 'swarm_sync':
            add_log("Triggering Swarm Sync to Mobile...")
            return jsonify({'success': True, 'action_type': 'swarm_sync', 'message': 'Swarm Handoff Initiated.'})

        elif action == 'build_semantic_index':
            import semantic_search
            add_log("Running Semantic execution: Building index")
            semantic_search.searcher.build_index_async(WORKSPACE_DIR)
            result_message = "Started building semantic index in the background. This may take a while."
            
        elif action == 'semantic_search':
            query = parsed.get('query')
            import semantic_search
            add_log(f"Running Semantic execution: Searching for '{query}'")
            result_message = semantic_search.searcher.search(query)

        elif action == 'take_screenshot':
            add_log("Running desktop execution: Capture screenshot")
            result_message = desktop_helper.take_desktop_screenshot()
            if isinstance(result_message, dict) and not result_message.get('success', True):
                success = False


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
                import llm_router
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": vision_prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_string}"}}
                        ]
                    }
                ]
                
                try:
                    result_message = llm_router.call_llm_with_fallback(
                        messages,
                        models=llm_router.VISION_FREE_MODELS,
                        timeout_per_model=15
                    )
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
        # Speak the response if voice agent is active
        voice_agent.speak(result_message)
    
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

@app.route('/saras_web_search.html')
@app.route('/websearch')
def saras_web_search_page():
    return send_from_directory(os.path.join(WORKSPACE_DIR, 'public'), 'saras_web_search.html')

@app.route('/saras_web_search.js')
def saras_web_search_js():
    return send_from_directory(os.path.join(WORKSPACE_DIR, 'public'), 'saras_web_search.js')

@app.route('/saras_vani_hud.html')
@app.route('/hud')
def saras_vani_hud_page():
    return send_from_directory(os.path.join(WORKSPACE_DIR, 'public'), 'saras_vani_hud.html')

@app.route('/saras_vani_hud.js')
def saras_vani_hud_js():
    return send_from_directory(os.path.join(WORKSPACE_DIR, 'public'), 'saras_vani_hud.js')

@app.route('/api/system-stats', methods=['GET'])
def get_system_stats():
    try:
        # CPU
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count(logical=True)
        cpu_freq = psutil.cpu_freq()
        
        # Memory
        mem = psutil.virtual_memory()
        
        # Disk
        disk = psutil.disk_usage('/')
        
        # Network
        net = psutil.net_io_counters()
        
        # System Uptime
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        
        return jsonify({
            'status': 'success',
            'cpu': {
                'percent': cpu_percent,
                'cores': cpu_count,
                'frequency': cpu_freq.current if cpu_freq else 0
            },
            'memory': {
                'total': mem.total,
                'available': mem.available,
                'percent': mem.percent,
                'used': mem.used
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            },
            'network': {
                'bytes_sent': net.bytes_sent,
                'bytes_recv': net.bytes_recv
            },
            'system': {
                'os': platform.system(),
                'release': platform.release(),
                'uptime_seconds': uptime_seconds
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


if __name__ == '__main__':
    # Start Autonomous Agent
    autonomous_agent.start_agent()
    
    # Start Voice Agent
    voice_agent.start_agent()
    
    # Run Flask server locally
    app.run(host='127.0.0.1', port=5000, debug=True)
