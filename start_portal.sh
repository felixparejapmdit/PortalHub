#!/bin/sh
# Start the PortalHub gateway on Linux or a NAS without Docker (needs Python 3.8+).
# Extra options are passed to serve.py, for example:
#   ./start_portal.sh --port 8090 --root /volume1/web
cd "$(dirname "$0")" || exit 1

PYTHON=$(command -v python3 || command -v python)
if [ -z "$PYTHON" ]; then
    echo "PortalHub needs Python 3.8 or newer (python3 was not found)." >&2
    exit 1
fi

exec "$PYTHON" serve.py --no-browser "$@"
