import os
import sys
import json
import base64
import socket
import ssl
import ipaddress
import webbrowser
from threading import Timer
from html.parser import HTMLParser
from urllib.parse import urlparse, parse_qs, urljoin
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 8088

# Small JSON API used by the portal page itself (same origin only)
API_PREFIX = '/api/'
META_TIMEOUT = 5
MAX_HTML_BYTES = 512 * 1024
MAX_ICON_BYTES = 96 * 1024


def lan_ipv4_addresses():
    """Private IPv4 addresses of this machine, so phones on the same Wi-Fi can reach the gateway.

    The interface on the default route comes first; virtual adapters (WSL, Hyper-V, Docker)
    usually sit in 172.16.0.0/12 and are listed last.
    """
    preferred = None
    try:
        # Connecting a UDP socket sends nothing; it only selects the outbound interface
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(('8.8.8.8', 53))
        preferred = probe.getsockname()[0]
        probe.close()
    except OSError:
        pass
    ips = {preferred} if preferred else set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    usable = [ip for ip in ips if ipaddress.ip_address(ip).is_private and not ip.startswith('127.')]
    return sorted(usable, key=lambda ip: (ip != preferred, ip.startswith('172.'), ip))


class _PageMetaParser(HTMLParser):
    """Collects <title>, description, site name and icon links from an HTML page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.description = ''
        self.site_name = ''
        self.icons = []  # (priority, href); lower priority is preferred
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or '') for k, v in attrs}
        if tag == 'title':
            self._in_title = True
        elif tag == 'meta':
            name = (a.get('name') or a.get('property') or '').lower()
            content = a.get('content', '').strip()
            if name in ('description', 'og:description') and not self.description:
                self.description = content
            elif name in ('og:site_name', 'application-name', 'apple-mobile-web-app-title') and not self.site_name:
                self.site_name = content
        elif tag == 'link':
            rel = a.get('rel', '').lower().split()
            href = a.get('href', '').strip()
            if href and ('icon' in rel or 'apple-touch-icon' in rel):
                # Prefer the large apple-touch-icon, then SVG, then other raster icons
                if 'apple-touch-icon' in rel:
                    priority = 0
                elif 'svg' in a.get('type', '') or href.lower().endswith('.svg'):
                    priority = 1
                else:
                    priority = 2
                self.icons.append((priority, href))

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and len(self.title) < 300:
            self.title += data


def _fetch(url, max_bytes, accept):
    # LAN services (Proxmox, routers, NAS) commonly use self-signed certificates;
    # only page metadata is read, so certificate errors are tolerated here
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    request = Request(url, headers={'User-Agent': 'PortalHub-Gateway/1.0', 'Accept': accept})
    with urlopen(request, timeout=META_TIMEOUT, context=context) as response:
        data = response.read(max_bytes + 1)
        return (response.geturl(), response.headers.get_content_type(),
                response.headers.get_content_charset(), data[:max_bytes], len(data) > max_bytes)


def fetch_page_meta(url):
    """Title, description and icon (as a data: URL) for the Add App auto-fill."""
    final_url, content_type, charset, body, _ = _fetch(url, MAX_HTML_BYTES, 'text/html,application/xhtml+xml,*/*;q=0.8')
    result = {'url': final_url, 'title': '', 'description': '', 'icon': ''}

    parser = _PageMetaParser()
    if content_type in ('text/html', 'application/xhtml+xml'):
        parser.feed(body.decode(charset or 'utf-8', errors='replace'))
        title = ' '.join((parser.site_name or parser.title).split())
        result['title'] = title[:80]
        result['description'] = ' '.join(parser.description.split())[:200]

    candidates = [urljoin(final_url, href) for _, href in sorted(parser.icons, key=lambda item: item[0])]
    candidates.append(urljoin(final_url, '/favicon.ico'))
    for icon_url in candidates[:4]:
        if urlparse(icon_url).scheme not in ('http', 'https'):
            continue
        try:
            _, icon_type, _, icon_data, too_big = _fetch(icon_url, MAX_ICON_BYTES, 'image/*')
        except Exception:
            continue
        if icon_data and not too_big and icon_type.startswith('image/'):
            result['icon'] = f"data:{icon_type};base64,{base64.b64encode(icon_data).decode('ascii')}"
            break
    return result


class PortalCORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.startswith(API_PREFIX):
            # API responses are for the portal page only: no CORS, never cached
            self.send_header('Cache-Control', 'no-store')
        else:
            # Allow cross-origin requests
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
            self.send_header('Access-Control-Allow-Headers', '*')
        # Do not send restrictive X-Frame-Options so all local apps can embed
        super().end_headers()

    def do_OPTIONS(self):
        # Refusing API preflights keeps other websites from calling the API cross-origin
        self.send_response(403 if self.path.startswith(API_PREFIX) else 200)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith(API_PREFIX):
            self.handle_api()
        else:
            super().do_GET()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def is_trusted_api_request(self):
        # Reject other websites (cross-site fetches) and DNS-rebinding hosts so the
        # metadata fetcher can't be used by a web page to probe the local network
        if self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
            return False
        host = (self.headers.get('Host') or '').rsplit(':', 1)[0].strip('[]').lower()
        hostname = socket.gethostname().lower()
        allowed = {'localhost', '127.0.0.1', '::1', hostname, f'{hostname}.local', *lan_ipv4_addresses()}
        return host in allowed

    def handle_api(self):
        if not self.is_trusted_api_request():
            self.send_json(403, {'error': 'forbidden'})
            return
        parsed = urlparse(self.path)
        if parsed.path == '/api/info':
            self.send_json(200, {'service': 'portalhub-gateway', 'port': PORT, 'lan_ips': lan_ipv4_addresses()})
        elif parsed.path == '/api/meta':
            target = (parse_qs(parsed.query).get('url') or [''])[0].strip()
            target_parts = urlparse(target)
            if target_parts.scheme not in ('http', 'https') or not target_parts.netloc:
                self.send_json(400, {'error': 'Provide an http(s) URL'})
                return
            try:
                self.send_json(200, fetch_page_meta(target))
            except Exception as e:
                self.send_json(502, {'error': f'Could not reach {target_parts.netloc}', 'detail': str(e)[:200]})
        else:
            self.send_json(404, {'error': 'not found'})

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
    for ip in lan_ipv4_addresses():
        print(f"  LAN URL:        http://{ip}:{PORT}/Portal/index.html", flush=True)
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
        print("\nStopping PortalHub server...", flush=True)
        httpd.server_close()

if __name__ == '__main__':
    run()
