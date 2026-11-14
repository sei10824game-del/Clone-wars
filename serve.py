#!/usr/bin/env python3
"""Tiny static server for the game preview.

`python3 -m http.server` sends no cache headers at all, which makes mobile
Safari keep serving a stale game.js/style.css after an update. This server
always sends no-store, supports conditional requests, and streams large
files in chunks so the preview proxy stays happy.
"""
import argparse
import os
import posixpath
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # allow the preview to be embedded in an iframe
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def guess_type(self, path):
        # some browsers refuse to execute JS served as text/plain
        if path.endswith(".js"):
            return "text/javascript"
        if path.endswith(".css"):
            return "text/css"
        return super().guess_type(path)

    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        path = posixpath.normpath(path)
        words = [w for w in path.split("/") if w and w not in (".", "..")]
        out = ROOT
        for w in words:
            out = os.path.join(out, w)
        if os.path.isdir(out):
            out = os.path.join(out, "index.html")
        return out

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--bind", default="0.0.0.0")
    args = ap.parse_args()

    handler = partial(NoCacheHandler, directory=ROOT)
    httpd = ThreadingHTTPServer((args.bind, args.port), handler)
    httpd.daemon_threads = True
    print(f"serving {ROOT} on http://{args.bind}:{args.port} (no-store)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
