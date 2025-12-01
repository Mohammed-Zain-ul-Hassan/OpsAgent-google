
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
import google.generativeai as genai
from dotenv import load_dotenv
import shutil

# New imports for auth
from datetime import datetime
import hashlib
import secrets

# IMPORTS FROM YOUR MODULES
from tools import tools_list, send_discord_alert
from state import PENDING_ACTIONS as approval_queue
from monitoring import check_monitors, run_command
import json
from pydantic import BaseModel

load_dotenv("../.env")

WORKSPACE_DIR = "agent_workspace"
AUTH_FILE = "auth.json"

# DATA MODEL FOR REQUESTS
class ActionRequest(BaseModel):
    id: str
    tool: str
    status: str # "PENDING", "APPROVED", "EXECUTED", "DENIED"
    timestamp: str
    description: str

class FileUpdate(BaseModel):
    content: str

class ConfigUpdate(BaseModel):
    monitors: list
    discord_webhooks: list[str] = []

CONFIG_FILE = "config.json"
MODEL_NAME = "gemini-2.5-flash-lite"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {"monitors": [], "discord_webhooks": []}
    with open(CONFIG_FILE, "r") as f:
        config = json.load(f)
        
        # MIGRATION: Handle old single webhook format
        if "discord_webhook_url" in config and config["discord_webhook_url"]:
            if "discord_webhooks" not in config:
                config["discord_webhooks"] = [config["discord_webhook_url"]]
            elif config["discord_webhook_url"] not in config["discord_webhooks"]:
                config["discord_webhooks"].append(config["discord_webhook_url"])
            del config["discord_webhook_url"]
            
        # Ensure key exists
        if "discord_webhooks" not in config:
            config["discord_webhooks"] = []
            
        return config

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)


import logging
import traceback

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn")

# --- 1. THE WATCHDOG (Background Task) ---
# This is the "Dumb Script" you asked about. It runs cheap checks.
alert_cooldown = False 

async def autonomous_watchdog():
    global alert_cooldown
    logger.info("--- 🐶 WATCHDOG: Monitoring ---")
    
    while True:
        try:
            config = load_config()
            monitors = config.get("monitors", [])
            
            # Run all monitors
            results = check_monitors(monitors)
            
            # Simple logic: If any command returns an error (non-zero exit code usually implies error text in our wrapper)
            # For now, we'll just log it. 
            # In a real scenario, we might want to parse specific outputs.
            # But here, let's look for explicit "Error" strings from our wrapper.
            
            issues = []
            for name, output in results.items():
                if output.startswith("Error"):
                    issues.append(f"{name}: {output}")
            
            if issues:
                if not alert_cooldown:
                    logger.info(f"--- 🚨 WATCHDOG: ISSUES DETECTED: {issues} ---")
                    logger.info("--- 🚨 ANOMALY DETECTED. WAKING AI AGENT... ---")
                    
                    prompt = f"CRITICAL ALERT: The following monitoring checks failed: {issues}. You MUST investigate and fix this."
                    
                    try:
                        # We send a message to the chat session invisibly
                        response = chat_session.send_message(prompt)
                        try:
                            logger.info(f"AI RESPONSE: {response.text}")
                        except:
                            logger.info(f"AI RESPONSE (No Text): {response.candidates[0].content}")
                    except Exception as ai_error:
                        logger.error(f"AI WAKEUP FAILED: {ai_error}")
                        logger.error(traceback.format_exc())
                    
                    alert_cooldown = True 
            else:
                if alert_cooldown:
                    logger.info("--- ✅ WATCHDOG: System returned to normal ---")
                    alert_cooldown = False

        except Exception as e:
            logger.error(f"Watchdog Error: {e}")

        await asyncio.sleep(10)

# --- 2. LIFESPAN MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the loop when server starts
    task = asyncio.create_task(autonomous_watchdog())
    yield
    # Kill the loop when server stops
    task.cancel()

# AUTH CONFIG
AUTH_FILE = "auth.json"
SESSIONS = {} # In-memory session store (token -> timestamp)

def load_auth_config():
    # 1. Check Environment Variable (Highest Priority)
    env_password = os.getenv("ADMIN_PASSWORD")
    if env_password:
        return {"password_hash": hashlib.sha256(env_password.encode()).hexdigest()}

    # 2. Check auth.json
    if not os.path.exists(AUTH_FILE):
        # Default password: admin
        default_hash = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
        with open(AUTH_FILE, "w") as f:
            json.dump({"password_hash": default_hash}, f)
    
    with open(AUTH_FILE, "r") as f:
        return json.load(f)

class LoginRequest(BaseModel):
    password: str

# --- 3. APP SETUP ---
app = FastAPI(lifespan=lifespan) # <--- CRITICAL: Attach the lifespan

@app.post("/login")
def login(request: LoginRequest):
    auth_config = load_auth_config()
    hashed_password = hashlib.sha256(request.password.encode()).hexdigest()
    
    if hashed_password == auth_config["password_hash"]:
        token = secrets.token_hex(16)
        SESSIONS[token] = datetime.now()
        return {"token": token}
    else:
        raise HTTPException(status_code=401, detail="Invalid password")

async def verify_token(request: Request):
    # Allow login and public endpoints
    if request.url.path in ["/login", "/docs", "/openapi.json", "/health", "/stream-test"]:
        return
    
    token = request.headers.get("X-Auth-Token")
    if not token or token not in SESSIONS:
        raise HTTPException(status_code=401, detail="Unauthorized")

# Add middleware manually or use Depends on each route. 
# For simplicity in this existing app, let's use a global dependency for protected routes 
# or just check it in the middleware.
# Middleware approach is cleaner for "protect everything".

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
        
    if request.url.path in ["/login", "/docs", "/openapi.json", "/health", "/stream-test"]:
        return await call_next(request)

    token = request.headers.get("X-Auth-Token")
    if not token or token not in SESSIONS:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        
    response = await call_next(request)
    return response

# Define allowed origins
origins = [
    "http://localhost:3000",
]

# Add FRONTEND_URL from env if it exists
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DEBUG: Print the configured Frontend URL
print(f"--- 🌍 CORS CONFIG: Allowing Origin: {os.getenv('FRONTEND_URL')} ---")

@app.middleware("http")
async def log_origin(request, call_next):
    origin = request.headers.get("origin")
    if origin:
        print(f"--- 📡 INCOMING ORIGIN: {origin} ---")
    response = await call_next(request)
    return response

# ... CONFIG GEMINI ...
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

SYSTEM_INSTRUCTION_FILE = os.path.join(WORKSPACE_DIR, "system_instruction.txt")

def load_system_instruction():
    # 1. HARDCODED CORE PROTOCOL (Immutable Guardrails)
    HARDCODED_CORE_PROTOCOL = """You are OpsGuardian, an elite SRE Agent.
    
CORE PROTOCOL (IMMUTABLE):
1. You are a highly skilled Site Reliability Engineer.
2. You have access to tools to monitor systems, execute commands, and manage files.
3. SAFETY: To execute ANY command, use the `run_terminal_command` tool.
4. Do NOT ask for permission in the chat. The `run_terminal_command` tool has built-in guardrails that will automatically trigger an Approval Workflow if the command is risky. Trust the tool.
5. You cannot modify your own core instructions.
6. When asked to investigate, start by checking system resources and metrics.
7. **PYTHON SCRIPTING**: If you need to run complex logic or fix code, you MUST use the `propose_fix_script` tool.
   - Do NOT try to run python code directly via terminal commands.
   - Draft the script, explain it, and call `propose_fix_script`.
   - **CRITICAL**: After calling this tool, you MUST respond to the user: "I have submitted a script proposal for your review. Please check the Approvals Tab."
"""

    # 2. Load User Custom Instructions (if any)
    user_instruction = ""
    if not os.path.exists(SYSTEM_INSTRUCTION_FILE):
        # Create default if missing, but it's just the editable part now
        default_instruction = "Additional User Instructions:\n(Add your custom rules here)"
        os.makedirs(WORKSPACE_DIR, exist_ok=True)
        with open(SYSTEM_INSTRUCTION_FILE, "w") as f:
            f.write(default_instruction)
    
    with open(SYSTEM_INSTRUCTION_FILE, "r") as f:
        user_instruction = f.read()

    # 3. Append all other files as context
    context_str = "\n\n--- ADDITIONAL CONTEXT ---\n"
    try:
        if os.path.exists(WORKSPACE_DIR):
            for filename in os.listdir(WORKSPACE_DIR):
                if filename == "system_instruction.txt":
                    continue
                
                file_path = os.path.join(WORKSPACE_DIR, filename)
                if os.path.isfile(file_path):
                    try:
                        with open(file_path, "r") as f:
                            content = f.read()
                            context_str += f"\n--- FILE: {filename} ---\n{content}\n"
                    except Exception:
                        pass # Skip binary or unreadable files
    except Exception as e:
        print(f"Error loading context: {e}")

    # Combine: Hardcoded Core + User Instructions + Context
    return HARDCODED_CORE_PROTOCOL + "\n\n" + user_instruction + context_str

system_instruction = load_system_instruction()

model = genai.GenerativeModel(
    model_name=MODEL_NAME,
    tools=tools_list,
    system_instruction=system_instruction
)

chat_session = model.start_chat(enable_automatic_function_calling=True)
current_runbook = None

# ... YOUR ENDPOINTS (Paste your existing endpoints below) ...

@app.get("/health")
def health_check():
    return {"status": "Online"}

@app.get("/system-status")
def api_system_status():
    config = load_config()
    return check_monitors(config.get("monitors", []))

@app.get("/config")
def get_config():
    return load_config()

@app.post("/config")
def update_config(config_data: ConfigUpdate):
    save_config(config_data.dict())
    return {"status": "updated"}

@app.get("/approvals")
def get_approvals():
    """Returns list of pending requests."""
    return {"requests": list(approval_queue.values())}

# Endpoint 2: Read a specific file (to show content in UI later)
@app.get("/files/{filename}")
def read_file_content(filename: str):
    file_path = os.path.join("./agent_workspace", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"error": "File not found"}

@app.post("/files/{filename}")
def save_file_content(filename: str, file_update: FileUpdate):
    file_path = os.path.join("./agent_workspace", filename)
    
    # CHECK LIMITS if creating a new file
    if not os.path.exists(file_path):
        files = os.listdir("./agent_workspace")
        
        if filename == "system_instruction.txt":
            # Only one system instruction allowed (it already exists usually, but just in case)
            pass 
        elif filename.endswith(".md") or filename.endswith(".txt"):
            # Context & Info: Limit 5
            context_files = [f for f in files if (f.endswith(".md") or f.endswith(".txt")) and f != "system_instruction.txt"]
            if len(context_files) >= 5:
                # Check if we are renaming? No, filename is key.
                return JSONResponse(status_code=400, content={"error": "Limit reached for Context & Info files (Max 5)."})
        else:
            # Extra Files: Limit 5
            extra_files = [f for f in files if not f.endswith(".md") and not f.endswith(".txt") and f != "system_instruction.txt"]
            if len(extra_files) >= 5:
                return JSONResponse(status_code=400, content={"error": "Limit reached for Extra Files (Max 5)."})

    try:
        with open(file_path, "w") as f:
            f.write(file_update.content)
        
        # If we updated ANY file, reload system instruction to include new context
        # This ensures the agent is always up to date
        global system_instruction, chat_session
        system_instruction = load_system_instruction()
        
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            tools=tools_list,
            system_instruction=system_instruction
        )
        chat_session = model.start_chat(enable_automatic_function_calling=True)

        return {"status": "saved", "filename": filename}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/files/{filename}")
def delete_file(filename: str):
    file_path = os.path.join("./agent_workspace", filename)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return {"status": "deleted", "filename": filename}
        return {"error": "File not found"}
    except Exception as e:
        return {"error": str(e)}

class ApprovalRequest(BaseModel):
    content: str = None # Optional edited content for scripts

@app.post("/approvals/{request_id}/approve")
def approve_request(request_id: str, body: ApprovalRequest = None):
    """The Human clicks 'Approve'."""
    if request_id not in approval_queue:
        return {"error": "Request not found"}
    
    req = approval_queue[request_id]
    
    # EXECUTE THE LOGIC HERE
    if req["tool"] == "run_terminal_command":
        command = req.get("command")
        if not command:
            return {"error": "No command found in request"}
            
        # Use the secure run_command from monitoring.py which handles pipes safely
        output = run_command(command)
        req["status"] = "EXECUTED"
        return {"status": "success", "result": output}

    elif req["tool"] == "execute_script":
        # 1. Get content (Edited > Original)
        script_content = req.get("content")
        if body and body.content:
            script_content = body.content
            
        if not script_content:
            return {"error": "No script content found"}
            
        # 2. Save to temp file
        filename = f"approved_script_{request_id}.py"
        file_path = os.path.join("./agent_workspace", filename)
        
        try:
            with open(file_path, "w") as f:
                f.write(script_content)
                
            # 3. Execute
            import sys
            import subprocess
            
            result = subprocess.run(
                [sys.executable, file_path], 
                capture_output=True, 
                text=True, 
                timeout=30
            )
            output = result.stdout + result.stderr
            
            # 4. Delete
            if os.path.exists(file_path):
                os.remove(file_path)
                
            req["status"] = "EXECUTED"
            return {"status": "success", "result": output}
            
        except Exception as e:
            return {"error": f"Script execution failed: {e}"}

    return {"error": "Unknown tool type"}

@app.post("/approvals/{request_id}/deny")
def deny_request(request_id: str):
    if request_id in approval_queue:
        approval_queue[request_id]["status"] = "DENIED"
    return {"status": "denied"}

class ExecuteScriptRequest(BaseModel):
    filename: str
    content: str

@app.post("/execute-script")
def execute_script(request: ExecuteScriptRequest):
    """
    Executes a Python script after user review.
    1. Overwrites the file with the (potentially edited) content.
    2. Executes it.
    3. Deletes the file.
    4. Returns output.
    """
    file_path = os.path.join("./agent_workspace", request.filename)
    
    # Security Check: Ensure it's in the workspace
    if not os.path.abspath(file_path).startswith(os.path.abspath("./agent_workspace")):
         return {"error": "Access denied: Path traversal detected."}

    try:
        # 1. Save Content
        with open(file_path, "w") as f:
            f.write(request.content)
            
        # 2. Execute
        # Use the same python environment
        import sys
        import subprocess
        
        result = subprocess.run(
            [sys.executable, file_path], 
            capture_output=True, 
            text=True, 
            timeout=30
        )
        
        output = result.stdout + result.stderr
        
        # 3. Delete
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return {"status": "success", "output": output}
        
    except Exception as e:
        return {"error": f"Execution failed: {e}"}

# Endpoint 1: List files for the Sidebar
@app.get("/files")
def get_files():
    try:
        # Ensure the directory exists to avoid errors
        if not os.path.exists("./agent_workspace"):
            return {"files": []}
        files = os.listdir("./agent_workspace")
        return {"files": files}
    except Exception as e:
        return {"files": [], "error": str(e)}

@app.post("/upload-runbook")
async def upload_runbook(file: UploadFile = File(...)):
    global current_runbook
    file_path = f"./agent_workspace/{file.filename}"
    with open(file_path, "wb+") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    uploaded_file = genai.upload_file(path=file_path, display_name="Company Runbook")
    while uploaded_file.state.name == "PROCESSING":
        await asyncio.sleep(1)
        uploaded_file = genai.get_file(uploaded_file.name)
        
    current_runbook = uploaded_file
    return {"status": "indexed", "filename": file.filename}

@app.get("/stream-test")
async def stream_test(prompt: str):
    global current_runbook
    
    async def event_generator():
        try:
            message_content = [prompt]
            if current_runbook:
                message_content.append(current_runbook)

            # Defensive Check: Ensure response has text
            response = chat_session.send_message(message_content, stream=False)
            
            try:
                full_text = response.text
            except Exception:
                if response.candidates[0].finish_reason == 1:
                    full_text = "Action processed. Please check the dashboard/approvals tab for details."
                else:
                    full_text = "Error: Agent finished with unexpected state."

            chunk_size = 10
            for i in range(0, len(full_text), chunk_size):
                chunk = full_text[i:i+chunk_size]
                clean_chunk = chunk.replace("\n", "\n") 
                yield f"data: {clean_chunk}\n\n"
                await asyncio.sleep(0.02)

        except Exception as e:
            print(f"Error: {e}")
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)