import time
import threading
import datetime
import desktop_helper
import logger

try:
    import psutil
except ImportError:
    psutil = None

def log_status(message):
    logger.log_status('AUTONOMOUS', message)

class AutonomousAgent:
    def __init__(self):
        self.running = False
        self.thread = None
        self.last_battery_alert = 0
        self.morning_routine_done = False
        
    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self.thread.start()
            log_status("Autonomous agent started.")
            
    def _monitor_loop(self):
        while self.running:
            try:
                self.check_battery()
                self.check_time_routine()
            except Exception as e:
                log_status(f"Error in monitor loop: {e}")
            time.sleep(60) # check every minute

    def check_battery(self):
        if psutil is None:
            return
        
        try:
            battery = psutil.sensors_battery()
            if battery:
                percent = battery.percent
                plugged = battery.power_plugged
                
                # If battery drops below 15% and not plugged in
                if percent <= 15 and not plugged:
                    current_time = time.time()
                    # Alert only once every 30 minutes
                    if current_time - self.last_battery_alert > 1800:
                        log_status(f"Battery critically low ({percent}%). Initiating power saving protocols.")
                        
                        # In a real scenario we could lower brightness via WMI or PowerShell
                        import subprocess
                        # Example: lower brightness to 20% (requires appropriate permissions/hardware)
                        try:
                            cmd = "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,20)"
                            subprocess.Popen(["powershell", "-Command", cmd], shell=True)
                        except:
                            pass
                            
                        self.last_battery_alert = current_time
        except Exception as e:
            log_status(f"Battery check failed: {e}")
                    
    def check_time_routine(self):
        now = datetime.datetime.now()
        
        # Reset routine flag around midnight
        if now.hour == 0 and now.minute < 5:
            self.morning_routine_done = False
            
        # At 9:00 AM (between 9:00 and 9:01), do morning routine
        if now.hour == 9 and now.minute == 0 and not self.morning_routine_done:
            log_status("Executing 9:00 AM Morning Routine.")
            
            # Open VS Code
            desktop_helper.open_desktop_app("code")
            
            # Wait a bit, then Open Spotify
            time.sleep(2)
            desktop_helper.open_desktop_app("spotify")
            
            # (Stub) Read unread emails
            log_status("Morning Routine: Checking unread emails... (Stub)")
            
            self.morning_routine_done = True
            
agent = AutonomousAgent()

def start_agent():
    agent.start()
