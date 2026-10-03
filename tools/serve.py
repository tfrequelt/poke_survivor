"""Serve the game for development, with caching turned off.

    python tools/serve.py          -> http://localhost:8000
    python tools/serve.py 8080     -> http://localhost:8080

Plain `python -m http.server` sends no cache headers, so the browser falls back to guessing how
long a file stays fresh -- and it guesses from how old the file is. A module that had not changed
in a week can then be reused for a day without the browser asking again, even after an edit and a
server restart. The page loads the new main.js's neighbours and an old main.js, and a feature that
is plainly in the code simply is not there. This sends `no-store` on everything, so a normal
reload always runs what is on disk.

It always serves the project folder, wherever it is started from.
"""

import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = http.server.ThreadingHTTPServer(('', port), NoCacheHandler)
    print(f'Serving {ROOT} at http://localhost:{port} (no caching). Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
