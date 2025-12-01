# Use a lightweight Python Linux image
FROM python:3.11-slim

# Set working directory inside the container
WORKDIR /app

# Copy requirements first (optimization: caches installed dependencies)
COPY requirements.txt .

# Install dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    net-tools \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .


# Create a non-root user
RUN useradd -m appuser

# Change ownership of the app directory
RUN chown -R appuser:appuser /app

# Switch to the user
USER appuser

# Cloud Run injects PORT
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}