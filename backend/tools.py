import os
import requests
import uuid
from datetime import datetime
from simulation import get_metrics, restart_service

DISCORD_WEBHOOK = os.getenv("DISCORD_WEBHOOK_URL")

# Define the "Sandbox" directory where the agent is allowed to play.
# This prevents the AI from overwriting your entire Mac.
WORK_DIR = "./agent_workspace"
os.makedirs(WORK_DIR, exist_ok=True)

def list_files():
    """Lists all files in the agent's workspace."""
    try:
        return str(os.listdir(WORK_DIR))
    except Exception as e:
        return f"Error listing files: {str(e)}"

def read_file(filename: str):
    """Reads the content of a file in the workspace."""
    filepath = os.path.join(WORK_DIR, filename)
    if not os.path.exists(filepath):
        return "Error: File does not exist."
    try:
        with open(filepath, "r") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

def write_file(filename: str, content: str):
    """Writes content to a file in the workspace. Overwrites if exists."""
    filepath = os.path.join(WORK_DIR, filename)
    try:
        with open(filepath, "w") as f:
            f.write(content)
        return f"Successfully wrote to {filename}"
    except Exception as e:
        return f"Error writing file: {str(e)}"

def check_payment_gateway_metrics():
    """Fetches real-time metrics from the Payment Gateway."""
    metrics = get_metrics()
    return f"METRICS REPORT: {str(metrics)}"

from state import PENDING_ACTIONS # <--- Import from shared file

def execute_service_restart():
    """
    REQUESTS to restart the Payment Gateway. 
    Does NOT execute immediately. Triggers an Approval Workflow.
    """
    print("--- 🛠️ TOOL CALLED: execute_service_restart ---") # <--- DEBUG PRINT

    # 1. Generate ID
    request_id = str(uuid.uuid4())[:8]
    print(f"--- 🆔 GENERATING REQUEST: {request_id} ---") # <--- DEBUG PRINT
    
    # 2. Store Request (Simulating DB insert)
    PENDING_ACTIONS[request_id] = {
        "id": request_id,
        "tool": "restart_service",
        "status": "PENDING",
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "description": "Restart Payment Gateway (High Load Detected)"
    }
    
    # 3. Custom Discord Message
    dashboard_url = f"{os.getenv('FRONTEND_URL')}/?tab=approvals"
    discord_payload = {
        "content": f"🛡️ **PERMISSION REQUIRED**\nAI Agent wants to: **RESTART SERVICE**\nReason: High Latency.\n\n[OPEN APPROVALS DASHBOARD]({dashboard_url})"
    }
    try:
        requests.post(DISCORD_WEBHOOK, json=discord_payload)
    except:
        pass

    # 4. Return message to the AI
    return f"ACTION PAUSED. Created Approval Request ID: {request_id}. Notify the user to check the Approvals Tab."

# A specialized tool for OpsGuardian to verify things
def check_system_status():
    """Simulates checking system health. In real life, this would run 'docker ps'."""
    # We mock this to force the AI to react to a specific scenario
    return "SYSTEM ALERT: Service 'Payment-Gateway' is returning 500 Errors. Memory usage: 98%."

def send_discord_alert(summary: str):
    """Sends a critical alert to the DevOps team via Discord."""
    
    # MAGIC LINK: We add ?action=review to the URL
    dashboard_url = f"{os.getenv('FRONTEND_URL')}/?action=review_incident"
    
    data = {
        "content": f"🚨 **OPS-GUARDIAN ALERT** 🚨\n{summary}\n\n[CLICK TO AUTHORIZE RESTART]({dashboard_url})"
    }
    try:
        requests.post(DISCORD_WEBHOOK, json=data)
        return "Alert sent to Discord."
    except Exception as e:
        return f"Failed to send alert: {e}"

# Map these to a list for the Gemini SDK
tools_list = [
    list_files, 
    read_file, 
    write_file, 
    check_payment_gateway_metrics, 
    execute_service_restart, 
    send_discord_alert 
]