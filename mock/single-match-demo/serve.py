"""Serve only this local viewer's static assets on loopback. No extra dependencies."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
ASSETS = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
          '/style.css': ('style.css', 'text/css'), '/app.js': ('app.js', 'text/javascript')}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        target = ASSETS.get(urlsplit(self.path).path)
        if target is None:
            self.send_error(404)
            return
        name, content_type = target
        data = (ROOT / name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; connect-src http://localhost:8787 ws://localhost:8787; style-src 'self'; script-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8788), Handler)
    print('Overlap live viewer: http://127.0.0.1:8788', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
