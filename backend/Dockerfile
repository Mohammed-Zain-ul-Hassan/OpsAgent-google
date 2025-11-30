# Use a lightweight Python Linux image
FROM python:3.11-slim

# Set working directory inside the container
WORKDIR /app

# Copy requirements first (optimization: caches installed dependencies)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .

# Expose the port
EXPOSE 8000

# Command to run the application
# host 0.0.0.0 is crucial for Docker networking
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]