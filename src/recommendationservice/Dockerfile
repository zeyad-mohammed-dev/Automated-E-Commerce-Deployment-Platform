# recommendationservice: suggests related products (Python, gRPC)
FROM python:3.12-slim

# no .pyc files, and print logs at once
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 1) dependencies first (cached when requirements.txt does not change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2) then the code
COPY . .

# do not run as root
RUN useradd --create-home appuser
USER appuser

EXPOSE 8080

CMD ["python", "recommendation_server.py"]
