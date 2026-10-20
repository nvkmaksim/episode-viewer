"""Static server for the viewer folder with HTTP Range support (a browser needs it to seek in the video).

    python tools/viewer/serve.py dist/viewer --port 8099

Read-only: serves files of one folder, nothing else; GET and HEAD only.
"""
import argparse
import http.server
import os
import re
import socketserver

RANGE = re.compile(r'bytes=(\d*)-(\d*)$')


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.gz': 'application/octet-stream',
                      '.mp4': 'video/mp4', '.js': 'text/javascript', '.json': 'application/json'}

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_head(self):
        header = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not header or not os.path.isfile(path):
            return super().send_head()
        match = RANGE.match(header.strip())
        size = os.path.getsize(path)
        if not match or (not match.group(1) and not match.group(2)):
            return super().send_head()
        if match.group(1):
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else size - 1
        else:   # the last N bytes
            start, end = max(0, size - int(match.group(2))), size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        handle = open(path, 'rb')
        handle.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._left = end - start + 1
        return handle

    def copyfile(self, source, outputfile):
        left = getattr(self, '_left', None)
        self._left = None
        if left is None:
            return super().copyfile(source, outputfile)
        try:
            while left > 0:
                chunk = source.read(min(65536, left))
                if not chunk:
                    break
                outputfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder')
    parser.add_argument('--port', type=int, default=8099)
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    os.chdir(args.folder)
    print(f'serving {os.getcwd()} on http://{args.host}:{args.port}/', flush=True)
    Server((args.host, args.port), Handler).serve_forever()
