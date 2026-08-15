FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Hugging Face Spaces require the app to listen on port 7860
ENV PORT=7860
EXPOSE 7860

# Run the application with Gunicorn
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:7860", "app:app"]
