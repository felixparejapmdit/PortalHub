# PortalHub gateway: serves the portal, other web projects next to it, and the auto-fill/QR API.
# Multi-arch base image (amd64, arm64, armv7), so it runs on Intel and ARM NAS models.
FROM python:3.12-alpine

# The portal lives in /app/Portal and is served at /Portal/.
# Other web projects can be mounted at /srv/www and are served at /<folder>/.
WORKDIR /app/Portal
COPY . .
RUN mkdir -p /srv/www

ENV PORTALHUB_PORT=8088 \
    PORTALHUB_ROOT=/srv/www \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8088

# Runs as an unprivileged user; docker-compose.yml can switch to a NAS user that can read your projects
USER 65534:65534

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORTALHUB_PORT', '8088'), timeout=4)"

CMD ["python", "serve.py", "--no-browser"]
