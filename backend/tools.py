import os
import requests
import uuid
from datetime import datetime
from monitoring import check_monitors
import json

def load_config():
    if not os.path.exists("config.json"):
        return {"monitors": []}
    with open("config.json", "r") as f:
        return json.load(f)

def get_discord_webhooks():
    config = load_config()
    # Support both new list and old string (via migration logic in main.py, but here we read raw json if we called load_config from tools.py which duplicates logic. 
    # Ideally tools.py should import load_config from main.py or share it. 
    # But tools.py has its own load_config. Let's update tools.py's load_config or just handle it here.)
    
    webhooks = config.get("discord_webhooks", [])
    
    # Fallback for old config if not migrated yet (though main.py migrates on load, tools.py reads file directly)
    if not webhooks and config.get("discord_webhook_url"):
        webhooks = [config.get("discord_webhook_url")]
        
    # Env var fallback
    env_webhook = os.getenv("DISCORD_WEBHOOK_URL")
    if env_webhook and env_webhook not in webhooks:
        webhooks.append(env_webhook)
        
    return webhooks

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
    if filename == "system_instruction.txt":
        return "Error: You cannot modify your own system instruction."
        
    filepath = os.path.join(WORK_DIR, filename)
    try:
        with open(filepath, "w") as f:
            f.write(content)
        return f"Successfully wrote to {filename}"
    except Exception as e:
        return f"Error writing file: {str(e)}"

def check_payment_gateway_metrics():
    """Fetches real-time metrics from the System. Takes no arguments."""
    config = load_config()
    results = check_monitors(config.get("monitors", []))
    return f"METRICS REPORT: {str(results)}"

from state import PENDING_ACTIONS # <--- Import from shared file

def execute_service_restart():
    """
    REQUESTS to restart the Payment Gateway. 
    Does NOT execute immediately. Triggers an Approval Workflow.
    Takes no arguments.
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
        webhooks = get_discord_webhooks()
        for webhook in webhooks:
            try:
                requests.post(webhook, json=discord_payload)
            except Exception as e:
                print(f"Failed to send to webhook {webhook}: {e}")
    except:
        pass

    # 4. Return message to the AI
    return f"ACTION PAUSED [AWAITING_APPROVAL]. Created Approval Request ID: {request_id}. Notify the user to check the Approvals Tab."

# A specialized tool for OpsGuardian to verify things
def check_system_status():
    """Checks system health using configured monitors. Takes no arguments."""
    config = load_config()
    results = check_monitors(config.get("monitors", []))
    return f"SYSTEM STATUS: {str(results)}"

def send_discord_alert(summary: str):
    """Sends a critical alert to the DevOps team via Discord."""
    
    # MAGIC LINK: We add ?action=review to the URL
    dashboard_url = f"{os.getenv('FRONTEND_URL')}/?action=review_incident"
    
    data = {
        "content": f"🚨 **OPS-GUARDIAN ALERT** 🚨\n{summary}\n\n[CLICK TO AUTHORIZE RESTART]({dashboard_url})"
    }
    try:
        webhook = os.getenv("DISCORD_WEBHOOK_URL")
        if webhook:
            try:
                requests.post(webhook, json=data)
                return "Alert sent to Discord webhook."
            except Exception as e:
                return f"Failed to send to webhook: {e}"
        return "Discord Webhook not configured (DISCORD_WEBHOOK_URL missing)."
    except Exception as e:
        return f"Failed to send alert: {e}"

import subprocess
import shlex

SAFE_COMMANDS = ["ls", "pwd", "grep", "cat", "echo", "ping", "df", "netstat", "whoami", "date", "uptime"]

def run_terminal_command(command: str):
    """
    Executes a terminal command.
    SAFE COMMANDS (run immediately): ls, pwd, grep, cat, echo, ping, df, netstat, whoami, date, uptime.
    ALL OTHER COMMANDS: Require HUMAN APPROVAL via the dashboard.
    """
    print(f"--- 💻 TOOL CALLED: run_terminal_command: {command} ---")
    
    # 1. Check if safe
    cmd_parts = shlex.split(command)
    if not cmd_parts:
        return "Error: Empty command."
        
    base_cmd = cmd_parts[0]
    
    if base_cmd in SAFE_COMMANDS:
        try:
            # Run safe command immediately
            result = subprocess.run(cmd_parts, capture_output=True, text=True, timeout=10)
            output = result.stdout + result.stderr
            return f"EXECUTION RESULT:\n{output}"
        except Exception as e:
            return f"Execution failed: {e}"
    
    # 2. If NOT safe, trigger Approval Workflow
    print(f"--- 🛡️ GUARDRAIL TRIGGERED: Risky command '{base_cmd}' detected. Requesting approval. ---")
    
    request_id = str(uuid.uuid4())[:8]
    
    PENDING_ACTIONS[request_id] = {
        "id": request_id,
        "tool": "run_terminal_command",
        "status": "PENDING",
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "description": f"Execute Command: {command}",
        "command": command # Store the command to execute later
    }
    
    # Notify Discord
    dashboard_url = f"{os.getenv('FRONTEND_URL')}/?tab=approvals"
    discord_payload = {
        "content": f"🛡️ **PERMISSION REQUIRED**\nAI Agent wants to run: `{command}`\n\n[OPEN APPROVALS DASHBOARD]({dashboard_url})"
    }
    try:
        webhooks = get_discord_webhooks()
        for webhook in webhooks:
            requests.post(webhook, json=discord_payload)
    except:
        pass

    return f"ACTION PAUSED [AWAITING_APPROVAL]. Command '{command}' requires admin approval. Request ID: {request_id}. Notify the user to check the Approvals Tab."

    return f"ACTION PAUSED [AWAITING_APPROVAL]. Command '{command}' requires admin approval. Request ID: {request_id}. Notify the user to check the Approvals Tab."

def delete_file(filename: str):
    """Deletes a file from the agent's workspace."""
    if filename == "system_instruction.txt":
        return "Error: You cannot delete your own system instruction."
        
    filepath = os.path.join(WORK_DIR, filename)
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            return f"Successfully deleted {filename}"
        return "Error: File does not exist."
    except Exception as e:
        return f"Error deleting file: {str(e)}"

def get_system_resources():
    """
    Returns current system resource usage (CPU, RAM, Disk).
    Takes no arguments.
    """
    try:
        import psutil
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        return (
            f"CPU Usage: {cpu_percent}%\n"
            f"Memory Usage: {memory.percent}% (Used: {memory.used // (1024**2)}MB / Total: {memory.total // (1024**2)}MB)\n"
            f"Disk Usage: {disk.percent}% (Free: {disk.free // (1024**3)}GB)"
        )
    except ImportError:
        return "Error: psutil library not installed."
    except Exception as e:
        return f"Error fetching resources: {str(e)}"

def make_http_request(url: str, method: str = "GET"):
    """
    Makes an HTTP request to a specific URL.
    Useful for checking if a service is up.
    Arguments:
    - url: The URL to request (e.g., http://localhost:8000/health)
    - method: GET or POST (default: GET)
    """
    try:
        if method.upper() == "POST":
            response = requests.post(url, timeout=5)
        else:
            response = requests.get(url, timeout=5)
            
        return f"Status Code: {response.status_code}\nResponse: {response.text[:500]}" # Limit output
    except Exception as e:
        return f"Request failed: {str(e)}"

def propose_fix_script(script_content: str, description: str):
    """
    Proposes a Python script to fix an issue. 
    Does NOT execute the script. 
    Creates an Approval Request for the user to review and run.
    Arguments:
    - script_content: The full Python code to execute.
    - description: A brief explanation of what the script does.
    """
    request_id = str(uuid.uuid4())[:8]
    
    PENDING_ACTIONS[request_id] = {
        "id": request_id,
        "tool": "execute_script",
        "status": "PENDING",
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "description": f"Run Script: {description}",
        "content": script_content # Store content for review
    }
    
    # Notify Discord
    dashboard_url = f"{os.getenv('FRONTEND_URL')}/?tab=approvals"
    discord_payload = {
        "content": f"🐍 **SCRIPT PROPOSAL**\nAI Agent wants to run a Python script.\nReason: {description}\n\n[OPEN APPROVALS DASHBOARD]({dashboard_url})"
    }
    try:
        webhooks = get_discord_webhooks()
        for webhook in webhooks:
            requests.post(webhook, json=discord_payload)
    except:
        pass

    return f"ACTION PAUSED [AWAITING_APPROVAL]. Script proposed. Request ID: {request_id}. Notify the user to check the Approvals Tab to review and run the script."

# Map these to a list for the Gemini SDK
tools_list = [
    list_files, 
    read_file, 
    write_file, 
    delete_file,
    check_payment_gateway_metrics, 
    execute_service_restart, 
    send_discord_alert,
    run_terminal_command,
    get_system_resources,
    make_http_request,
    propose_fix_script
]