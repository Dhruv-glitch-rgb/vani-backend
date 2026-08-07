import threading
from collections import deque

# Shared log buffer (stores last 50 log items)
LOG_BUFFER = deque(maxlen=50)
log_lock = threading.Lock()

def log_status(tag, message):
    """Log a message to the terminal and to the web log buffer."""
    msg = f"[{tag}] {message}"
    print(msg, flush=True)
    with log_lock:
        LOG_BUFFER.append(msg)

def get_logs():
    """Retrieve all logged messages in the buffer."""
    with log_lock:
        return list(LOG_BUFFER)
