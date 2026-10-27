# The erasure job's container (apps/erasure/wrangler.jsonc, docs/telemetry.md#erasure).
FROM python:3.13-slim@sha256:81c118faaca296a46b46a7dd7f3bf7575a956d8a4af22623b3de2ff504a3e89b
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --chmod=0644 requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chmod=0644 erase.py server.py ./
USER nobody
EXPOSE 8080
CMD ["python", "server.py"]
