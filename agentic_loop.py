import os
import time
import base64
import urllib.request
import json
import threading
import desktop_helper
import logger

def log_status(message):
    logger.log_status('AUTONOMOUS_LOOP', message)

class AgenticLoop:
    def __init__(self):
        self.max_iterations = 10
        
    def start_goal(self, goal):
        # We run the loop in a background thread so it doesn't block the Flask server
        thread = threading.Thread(target=self._run_loop, args=(goal,), daemon=True)
        thread.start()
        return "Autonomous agent deployed. I am analyzing your screen and taking control of the mouse and keyboard to achieve your goal. Please do not move the mouse..."

    def _run_loop(self, goal):
        log_status(f"Starting God-Mode Loop for goal: {goal}")
        api_key = os.environ.get("OPENROUTER_API_KEY", "")
        
        # We will use GPT-4o or Gemini-1.5-Pro for vision reasoning
        messages = [
            {
                "role": "system",
                "content": f"""You are an Autonomous Desktop Agent with FULL control over the user's computer.
Your current GOAL is: "{goal}"

You will be given a screenshot of the current screen. 
You must analyze the screen and return a SINGLE JSON object representing your next action.

Actions available:
1. "click": {{"action": "click", "x": 100, "y": 200}} (clicks at coordinate)
2. "type": {{"action": "type", "text": "hello"}} (types text)
3. "hotkey": {{"action": "hotkey", "key": "ctrl+c"}} (presses hotkey)
4. "wait": {{"action": "wait", "seconds": 2}} (waits for screen to load)
5. "done": {{"action": "done", "message": "Goal completed successfully"}}
6. "fail": {{"action": "fail", "message": "I cannot complete this goal"}}

Respond ONLY with valid JSON. No markdown.
"""
            }
        ]
        
        for iteration in range(self.max_iterations):
            log_status(f"Iteration {iteration+1}/{self.max_iterations}")
            
            # 1. Take Screenshot
            screen_data = desktop_helper.take_desktop_screenshot()
            if not isinstance(screen_data, dict) or not screen_data.get('success'):
                log_status("Failed to take screenshot.")
                break
                
            img_url = screen_data.get('image_url')
            filepath = os.path.join(os.path.dirname(__file__), img_url.lstrip('/'))
            
            encoded_string = ""
            try:
                with open(filepath, "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            except Exception as e:
                log_status(f"Error reading screenshot: {e}")
                break

            # 2. Append screenshot to messages
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": "This is the current screen. What is your next action?"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_string}"}}
                ]
            })

            # 3. Request LLM
            req = urllib.request.Request(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                data=json.dumps({
                    "model": "google/gemini-flash-1.5-8b", # Upgrade to pro for production
                    "messages": messages
                }).encode('utf-8')
            )
            
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    v_data = json.loads(response.read().decode('utf-8'))
                    response_text = v_data['choices'][0]['message']['content'].strip()
            except Exception as e:
                log_status(f"LLM API failed: {e}")
                break
                
            # Clean markdown
            import re
            response_text = re.sub(r'^```json\s*', '', response_text, flags=re.IGNORECASE)
            response_text = re.sub(r'\s*```$', '', response_text)
            
            try:
                action_json = json.loads(response_text)
            except json.JSONDecodeError:
                log_status(f"Failed to parse JSON: {response_text}")
                messages.append({"role": "assistant", "content": response_text})
                messages.append({"role": "user", "content": "Invalid JSON. Please output strictly JSON."})
                continue
                
            log_status(f"Agent Action: {action_json}")
            messages.append({"role": "assistant", "content": json.dumps(action_json)})
            
            # 4. Execute Action
            action_type = action_json.get("action")
            
            if action_type == "click":
                x = action_json.get("x")
                y = action_json.get("y")
                desktop_helper.use_desktop_app("click", f"{x},{y}")
                time.sleep(1) # wait for click to register
            elif action_type == "type":
                text = action_json.get("text")
                desktop_helper.use_desktop_app("type", text)
            elif action_type == "hotkey":
                key = action_json.get("key")
                desktop_helper.use_desktop_app("hotkey", key)
            elif action_type == "wait":
                secs = action_json.get("seconds", 2)
                time.sleep(secs)
            elif action_type == "done":
                log_status(f"Goal Completed: {action_json.get('message')}")
                break
            elif action_type == "fail":
                log_status(f"Goal Failed: {action_json.get('message')}")
                break
            else:
                log_status(f"Unknown action: {action_type}")
                
            time.sleep(1) # Short pause between loops
            
        else:
            log_status("Loop exited after max iterations.")

agent_loop = AgenticLoop()
