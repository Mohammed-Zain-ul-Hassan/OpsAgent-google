import os
import json

# This file acts as our "Infrastructure State"
STATE_FILE = "system_state.json"

def initialize_state():
    """Reset the system to a BROKEN state."""
    state = {
        "service_name": "payment-gateway",
        "status": "CRITICAL",
        "error_code": 500,
        "active_connections": 2048, # Too many connections!
        "max_connections": 1000,
        "uptime": "14 days"
    }
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)
    return "System RESET to BROKEN state."

def get_metrics():
    """Simulates reading Prometheus/Grafana metrics."""
    if not os.path.exists(STATE_FILE):
        initialize_state()
    
    with open(STATE_FILE, "r") as f:
        return json.load(f)

def restart_service():
    """The 'Fix'. Resets connections."""
    state = get_metrics()
    state["status"] = "HEALTHY"
    state["error_code"] = 200
    state["active_connections"] = 42
    state["uptime"] = "1 second"
    
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)
    
    return "Service 'payment-gateway' restarted successfully. Metrics normalized."

# Initialize it immediately so the file exists
if not os.path.exists(STATE_FILE):
    initialize_state()