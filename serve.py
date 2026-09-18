import os
import sys
import socket
import webbrowser
from threading import Timer
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 8088

class PortalCORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', '*')
        # Do not send restrictive X-Frame-Options so all local apps can embed
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Clean console output
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

class DualStackThreadingServer(ThreadingHTTPServer):
    def __init__(self, server_address, RequestHandlerClass):
        try:
            self.address_family = socket.AF_INET6
            super().__init__(server_address, RequestHandlerClass, bind_and_activate=False)
            # IPV6_V6ONLY = 0 enables dual-stack: accepts both IPv6 (::1 / localhost) and IPv4 (127.0.0.1)
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            self.server_bind()
            self.server_activate()
        except Exception:
            # Fallback to standard IPv4 if IPv6 dual-stack is unsupported
            self.address_family = socket.AF_INET
            super().__init__(('0.0.0.0', server_address[1]), RequestHandlerClass)

def open_browser():
    url = f"http://localhost:{PORT}/Portal/index.html"
    print(f"Opening browser to {url} ...", flush=True)
    webbrowser.open(url)

def run():
    # Set working directory to parent (D:\PROJECTS) so all sibling projects can be accessed
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    os.chdir(parent_dir)

    print("=" * 65, flush=True)
    print("  PortalHub Unified Service Gateway (Dual-Stack IPv4/IPv6)", flush=True)
    print(f"  Root Directory: {parent_dir}", flush=True)
    print(f"  Portal URL:     http://localhost:{PORT}/Portal/index.html", flush=True)
    print(f"  Local IP URL:   http://127.0.0.1:{PORT}/Portal/index.html", flush=True)
    print("=" * 65, flush=True)

    try:
        httpd = DualStackThreadingServer(('', PORT), PortalCORSRequestHandler)
    except OSError as e:
        if getattr(e, 'winerror', None) == 10048 or "Address already in use" in str(e):
            print(f"\n[ERROR] Port {PORT} is already in use by another process.", flush=True)
            print("Please close any existing server windows or processes and try again.\n", flush=True)
        else:
            print(f"\n[ERROR] Failed to bind server: {e}\n", flush=True)
        sys.exit(1)

    # Open browser only after the socket has been bound and activated
    # Disable automatic browser open when launched with --no-browser flag
    if '--no-browser' not in sys.argv:
        Timer(0.6, open_browser).start()

    print(f"\nServer ready! Press Ctrl+C in this window to stop.", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping MyPortal server...", flush=True)
        httpd.server_close()

if __name__ == '__main__':
    run()
