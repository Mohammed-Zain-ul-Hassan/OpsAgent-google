import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
import google.generativeai as genai
from dotenv import load_dotenv
import shutil

# IMPORTS FROM YOUR MODULES
# IMPORTS FROM YOUR MODULES
from tools import tools_list, send_discord_alert
from state import PENDING_ACTIONS as approval_queue
from simulation import get_metrics, restart_service
from pydantic import BaseModel

load_dotenv("../.env")

# DATA MODEL FOR REQUESTS
class ActionRequest(BaseModel):
    id: str
    tool: str
    status: str # "PENDING", "APPROVED", "EXECUTED", "DENIED"
    timestamp: str
    description: str

import logging

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
            metrics = get_metrics()
            
            # CONDITION: System is failing
            if metrics["active_connections"] > 1000:
                if not alert_cooldown:
                    logger.info(f"--- 🚨 WATCHDOG: CRITICAL STATE DETECTED ({metrics['active_connections']} conn) ---")
                    logger.info("--- 🚨 ANOMALY DETECTED. WAKING AI AGENT... ---")
                    
                    # DIRECT INJECTION: We force the AI to process this information
                    # We send a message to the chat session invisibly
                    prompt = "CRITICAL ALERT: Active Connections = 2048. This exceeds the limit of 1000. You MUST immediately call 'execute_service_restart' to fix this. Do not check metrics again, I have already checked them."
                    
                    # The AI will respond, likely calling 'execute_service_restart'
                    # We don't need to stream this to the frontend, just let it happen in background
                    try:
                        response = chat_session.send_message(prompt)
                        try:
                            logger.info(f"AI RESPONSE: {response.text}")
                        except:
                            logger.info(f"AI RESPONSE (No Text): {response.candidates[0].content}")
                    except Exception as ai_error:
                        logger.error(f"AI WAKEUP FAILED: {ai_error}")
                    
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

# --- 3. APP SETUP ---
app = FastAPI(lifespan=lifespan) # <--- CRITICAL: Attach the lifespan

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL")],
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

system_instruction = """
You are OpsGuardian, an elite SRE Agent.
PROTOCOL:
1. When asked to investigate, call `check_payment_gateway_metrics`.
2. If metrics > 1000 connections:
   a. Call `send_discord_alert`.
   b. CALL `execute_service_restart`. 
   (Do not ask for permission in text. Call the tool. The tool handles the approval workflow).
"""

model = genai.GenerativeModel(
    'gemini-2.5-flash-lite',
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
    return get_metrics()

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

@app.post("/approvals/{request_id}/approve")
def approve_request(request_id: str):
    """The Human clicks 'Approve'."""
    if request_id not in approval_queue:
        return {"error": "Request not found"}
    
    req = approval_queue[request_id]
    
    # EXECUTE THE LOGIC HERE
    if req["tool"] == "restart_service":
        result = restart_service() # Actually do it now
        req["status"] = "EXECUTED"
        return {"status": "success", "result": result}
        
    return {"error": "Unknown tool type"}

@app.post("/approvals/{request_id}/deny")
def deny_request(request_id: str):
    if request_id in approval_queue:
        approval_queue[request_id]["status"] = "DENIED"
    return {"status": "denied"}

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
                    full_text = "Action executed successfully."
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