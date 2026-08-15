import threading
from collections import deque

# Shared log buffer (stores last 50 log items)
LOG_BUFFER = deque(maxlen=50)
log_lock = threading.Lock()

import sys

def log_status(tag, message):
    """Log a message to the terminal and to the web log buffer safely across encodings."""
    msg = f"[{tag}] {message}"
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        try:
            sys.stdout.buffer.write((msg + '\n').encode('utf-8', errors='replace'))
            sys.stdout.flush()
        except Exception:
            safe_msg = msg.encode('ascii', errors='replace').decode('ascii')
            print(safe_msg, flush=True)
    except Exception:
        pass

    with log_lock:
        LOG_BUFFER.append(msg)

def get_logs():
    """Retrieve all logged messages in the buffer."""
    with log_lock:
        return list(LOG_BUFFER)
