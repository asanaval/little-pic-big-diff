"""Local preview server for site/: Python's http.server with caching switched off, so a phone or a
browser on the LAN always gets the current files (http.server sends no cache headers, and Chrome
then keeps a script on its own judgement, which shows stale code after an edit).

    python serve.py [port]    # default 8137, all interfaces
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent / "site"


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
    print(f"Serving {SITE} on port {port} (no caching)")
    ThreadingHTTPServer(("", port), partial(NoCacheHandler, directory=str(SITE))).serve_forever()
