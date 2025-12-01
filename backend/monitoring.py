import subprocess
import logging

logger = logging.getLogger("uvicorn")

import shlex

def run_command(command: str) -> str:
    """
    Executes a shell command securely without shell=True.
    Supports pipes (|) by chaining subprocesses.
    """
    try:
        # 1. Split by pipe if present
        parts = command.split('|')
        
        # 2. Prepare the first process
        # shlex.split parses arguments safely (e.g. handles quotes)
        args = shlex.split(parts[0].strip())
        
        if not args:
            return "Error: Empty command"

        # Keep track of all processes to wait for them
        procs = []
        
        # Start first process
        last_proc = subprocess.Popen(
            args, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True
        )
        procs.append(last_proc)
        
        # 3. Chain subsequent processes
        for part in parts[1:]:
            args = shlex.split(part.strip())
            if not args:
                continue
                
            # Start next process, connecting input to previous output
            proc = subprocess.Popen(
                args,
                stdin=last_proc.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            # Allow previous process to receive SIGPIPE if next exits
            last_proc.stdout.close() 
            last_proc = proc
            procs.append(last_proc)
            
        # 4. Get final output
        stdout, stderr = last_proc.communicate(timeout=10)
        
        # Wait for all previous processes to ensure no zombies
        for p in procs[:-1]:
            p.wait()
        
        if last_proc.returncode != 0:
            return f"Error (Exit Code {last_proc.returncode}): {stderr.strip()}"
            
        return stdout.strip()

    except subprocess.TimeoutExpired:
        last_proc.kill()
        return "Error: Command timed out."
    except FileNotFoundError:
        return "Error: Command not found."
    except Exception as e:
        return f"Error executing command: {str(e)}"

def check_monitors(monitors: list) -> dict:
    """Iterates through configured monitors and runs them."""
    results = {}
    for monitor in monitors:
        name = monitor.get("name")
        command = monitor.get("command")
        if name and command:
            logger.info(f"Running monitor: {name} -> {command}")
            output = run_command(command)
            results[name] = output
    return results
