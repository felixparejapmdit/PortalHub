"""PortalHub gateway: serves the portal, sibling web projects, and a small same-origin API.

Runs on Windows (start_portal.bat), Linux or a NAS (start_portal.sh), or in Docker (Dockerfile).
Every option can be set with a command-line flag or an environment variable; run with --help.
Needs only the Python 3.8+ standard library.
"""
import argparse
import base64
import functools
import ipaddress
import json
import os
import posixpath
import signal
import socket
import ssl
import sys
import webbrowser
from threading import Timer
from html.parser import HTMLParser
from urllib.parse import urlparse, parse_qs, urljoin, unquote
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# The portal is served from its own folder at /<folder name>/ (normally /Portal/),
# wherever the projects root points
PORTAL_DIR = os.path.dirname(os.path.abspath(__file__))
PORTAL_PREFIX = '/' + os.path.basename(PORTAL_DIR) + '/'

# Small JSON API used by the portal page itself (same origin only)
API_PREFIX = '/api/'
META_TIMEOUT = 5
MAX_HTML_BYTES = 512 * 1024
MAX_ICON_BYTES = 96 * 1024

# Host names that only resolve on the local network, so a website can't use them for DNS rebinding
LOCAL_HOST_SUFFIXES = ('.local', '.lan', '.home', '.home.arpa', '.internal', '.localdomain')

# Revalidated on every load, so files updated on the server show up right away
REVALIDATE_EXTENSIONS = ('.html', '.htm', '.js', '.mjs', '.json', '.webmanifest', '.css')

CONFIG = argparse.Namespace()  # filled in by parse_config()


def env_flag(name, default=False):
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def parse_config(argv=None):
    parser = argparse.ArgumentParser(description='PortalHub gateway server')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORTALHUB_PORT') or 8088),
                        help='port to listen on (PORTALHUB_PORT, default 8088)')
    parser.add_argument('--bind', default=os.environ.get('PORTALHUB_BIND', ''),
                        help='address to listen on (PORTALHUB_BIND, default: every interface, IPv4 and IPv6)')
    parser.add_argument('--root', default=os.environ.get('PORTALHUB_ROOT') or os.path.dirname(PORTAL_DIR),
                        help='folder whose sub-folders are served as web projects, e.g. /PSE/ '
                             '(PORTALHUB_ROOT, default: the folder that contains PortalHub)')
    parser.add_argument('--lan-host', default=os.environ.get('PORTALHUB_LAN_HOST', ''),
                        help='address phones should use for QR codes, e.g. 192.168.1.50 or nas.local '
                             '(PORTALHUB_LAN_HOST, default: detected)')
    parser.add_argument('--allowed-hosts', default=os.environ.get('PORTALHUB_ALLOWED_HOSTS', ''),
                        help='comma-separated extra host names allowed to use the API, such as a '
                             'reverse-proxy domain (PORTALHUB_ALLOWED_HOSTS)')
    parser.add_argument('--dir-listing', action='store_true', default=env_flag('PORTALHUB_DIR_LISTING'),
                        help='list the files of folders that have no index.html (PORTALHUB_DIR_LISTING=1)')
    parser.add_argument('--no-browser', action='store_true', default=not env_flag('PORTALHUB_OPEN_BROWSER', True),
                        help="don't open a browser on start (PORTALHUB_OPEN_BROWSER=0)")
    config = parser.parse_args(argv)
    config.root = os.path.abspath(config.root)
    config.lan_host = config.lan_host.strip()
    config.allowed_hosts = {h.strip().lower() for h in config.allowed_hosts.split(',') if h.strip()}
    if config.lan_host:
        config.allowed_hosts.add(config.lan_host.lower())
    return config


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


def advertised_addresses():
    """Addresses for QR codes: the configured LAN host first, then the detected ones."""
    detected = lan_ipv4_addresses()
    if not CONFIG.lan_host:
        return detected
    return [CONFIG.lan_host] + [ip for ip in detected if ip != CONFIG.lan_host]


def host_without_port(host_header):
    host = (host_header or '').strip().lower()
    if host.startswith('['):
        return host[1:host.find(']')] if ']' in host else host[1:]
    return host.split(':', 1)[0]


def is_local_host_name(host):
    """True for addresses a remote website can't point at this server through DNS rebinding."""
    if not host:
        return False
    try:
        ipaddress.ip_address(host)
        return True  # IP literals involve no DNS lookup
    except ValueError:
        pass
    return (host in ('localhost', socket.gethostname().lower())
            or '.' not in host  # single-label names resolve on the LAN only
            or host.endswith(LOCAL_HOST_SUFFIXES))


def request_path(raw_path):
    """URL path without query or fragment, percent-decoded and normalized (no '..')."""
    path = raw_path.split('?', 1)[0].split('#', 1)[0]
    trailing_slash = path.endswith('/')
    path = posixpath.normpath(unquote(path))
    if not path.startswith('/'):
        path = '/' + path.lstrip('.')
    if trailing_slash and not path.endswith('/'):
        path += '/'
    return path


def is_hidden_path(path):
    # .git, .env, .firebase and other dot-files are never served
    return any(part.startswith('.') for part in path.split('/') if part)


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


class PortalHandler(SimpleHTTPRequestHandler):
    # Explicit types for files whose type varies between systems (service workers must be JavaScript)
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
        '.wasm': 'application/wasm',
    })

    def end_headers(self):
        path = request_path(self.path)
        if path.startswith(API_PREFIX):
            # API responses are for the portal page only: no CORS, never cached
            self.send_header('Cache-Control', 'no-store')
        else:
            # Allow cross-origin requests
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
            self.send_header('Access-Control-Allow-Headers', '*')
            if path.endswith('/') or path.lower().endswith(REVALIDATE_EXTENSIONS):
                self.send_header('Cache-Control', 'no-cache')
        # Do not send restrictive X-Frame-Options so all local apps can embed
        super().end_headers()

    def do_OPTIONS(self):
        # Refusing API preflights keeps other websites from calling the API cross-origin
        self.send_response(403 if self.path.startswith(API_PREFIX) else 200)
        self.end_headers()

    def do_GET(self):
        if request_path(self.path).startswith(API_PREFIX):
            self.handle_api()
        else:
            super().do_GET()

    def send_head(self):
        path = request_path(self.path)
        if path == '/':
            self.send_response(302)
            self.send_header('Location', PORTAL_PREFIX)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        if is_hidden_path(path):
            self.send_error(404, 'File not found')
            return None
        return super().send_head()

    def translate_path(self, path):
        clean = request_path(path)
        if clean == PORTAL_PREFIX[:-1] or clean.startswith(PORTAL_PREFIX):
            return self._translate_from(PORTAL_DIR, '/' + clean[len(PORTAL_PREFIX):])
        return super().translate_path(path)

    def _translate_from(self, base_dir, path):
        original = self.directory
        self.directory = base_dir
        try:
            return super().translate_path(path)
        finally:
            self.directory = original

    def list_directory(self, path):
        if CONFIG.dir_listing:
            return super().list_directory(path)
        self.send_error(404, 'File not found')
        return None

    def send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def is_trusted_api_request(self):
        # Reject other websites (cross-site fetches) and DNS-rebinding host names so the
        # metadata fetcher can't be used by a web page to probe the local network
        if self.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
            return False
        host = host_without_port(self.headers.get('Host'))
        return is_local_host_name(host) or host in CONFIG.allowed_hosts

    def handle_api(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/health':
            self.send_json(200, {'status': 'ok'})
            return
        if not self.is_trusted_api_request():
            self.send_json(403, {'error': 'forbidden'})
            return
        if parsed.path == '/api/info':
            self.send_json(200, {
                'service': 'portalhub-gateway',
                'port': CONFIG.port,
                'hostname': socket.gethostname(),
                'lan_ips': advertised_addresses()
            })
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
    daemon_threads = True

    def __init__(self, server_address, RequestHandlerClass):
        host, port = server_address
        if host in ('', '::'):
            try:
                self.address_family = socket.AF_INET6
                super().__init__(('::', port), RequestHandlerClass, bind_and_activate=False)
                # IPV6_V6ONLY = 0 enables dual-stack: accepts both IPv6 (::1 / localhost) and IPv4 (127.0.0.1)
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
                self.server_bind()
                self.server_activate()
                return
            except Exception:
                # IPv6 is unavailable (some NAS kernels and containers): listen on IPv4 only
                host = '0.0.0.0'
        self.address_family = socket.AF_INET6 if ':' in host else socket.AF_INET
        super().__init__((host, port), RequestHandlerClass)


def _stop_on_signal(signum, frame):
    # Docker and systemd stop the server with SIGTERM; shut down like Ctrl+C
    raise KeyboardInterrupt


def open_browser():
    url = f"http://localhost:{CONFIG.port}{PORTAL_PREFIX}index.html"
    print(f"Opening browser to {url} ...", flush=True)
    webbrowser.open(url)


def run():
    global CONFIG
    CONFIG = parse_config()
    if not os.path.isdir(CONFIG.root):
        print(f"\n[ERROR] Projects folder not found: {CONFIG.root}\n", flush=True)
        sys.exit(1)

    print("=" * 65, flush=True)
    print("  PortalHub Gateway (IPv4/IPv6)", flush=True)
    print(f"  Portal folder:   {PORTAL_DIR}  ->  {PORTAL_PREFIX}", flush=True)
    print(f"  Projects folder: {CONFIG.root}  ->  /<folder>/", flush=True)
    print(f"  Portal URL:      http://localhost:{CONFIG.port}{PORTAL_PREFIX}index.html", flush=True)
    for address in advertised_addresses():
        print(f"  LAN URL:         http://{address}:{CONFIG.port}{PORTAL_PREFIX}", flush=True)
    print("=" * 65, flush=True)

    handler = functools.partial(PortalHandler, directory=CONFIG.root)
    try:
        httpd = DualStackThreadingServer((CONFIG.bind, CONFIG.port), handler)
    except OSError as e:
        if getattr(e, 'winerror', None) == 10048 or "Address already in use" in str(e):
            print(f"\n[ERROR] Port {CONFIG.port} is already in use by another process.", flush=True)
            print("Please close any existing server windows or processes and try again.\n", flush=True)
        else:
            print(f"\n[ERROR] Failed to bind server: {e}\n", flush=True)
        sys.exit(1)

    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, _stop_on_signal)

    # Open browser only after the socket has been bound and activated
    if not CONFIG.no_browser:
        Timer(0.6, open_browser).start()

    print(f"\nServer ready! Press Ctrl+C in this window to stop.", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping PortalHub server...", flush=True)
        httpd.server_close()

if __name__ == '__main__':
    run()
