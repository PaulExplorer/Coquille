# Icons

The extension icons (`public/icons/icon-{16,32,48,96,128}.png`) are generated
from `assets/logo-v1.svg` (diamond frame + solid gem, gradient `#2E70C6` →
`#073F77`, transparent background).

Firefox headless screenshots always composite on an opaque white background,
so the pipeline rasterizes the SVG on a `<canvas>` (which keeps alpha) and
uploads the PNG data URLs to a throwaway local HTTP server. Run from an empty
directory:

```sh
mkdir -p /tmp/icon-render && cd /tmp/icon-render
cp /path/to/repo/assets/logo-v1.svg .

# 1. The renderer page: drawImage at each size, single POST with all data URLs.
#    The <img src="/slow"> keeps the load event pending for ~4s so the browser
#    does not quit before the upload.
cat > render.html <<'HTML'
<!doctype html>
<html><body>
<img id="logo" src="logo-v1.svg">
<img src="/slow">
<script>
const SIZES = [16, 32, 48, 96, 128];
const img = document.getElementById('logo');
img.decode().then(async () => {
  const payload = {};
  for (const size of SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/png');
    payload[`icon-${size}.png`] = dataUrl.split(',')[1];
  }
  await fetch('/icons', { method: 'POST', body: JSON.stringify(payload) });
});
</script>
</body></html>
HTML

# 2. The server: serves the files, receives the POST, and stalls /slow.
cat > server.py <<'PY'
import base64, http.server, json, pathlib, socketserver, time
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/slow':
            time.sleep(4)
            self.send_response(204); self.end_headers(); return
        super().do_GET()
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])).decode('ascii'))
        for name, b64 in payload.items():
            (pathlib.Path.cwd() / name).write_bytes(base64.b64decode(b64))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *args): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', 8124), Handler) as server:
    server.serve_forever()
PY

# 3. Run and collect
(setsid python3 server.py > server.log 2>&1 &)
sleep 1
firefox --headless --no-remote --profile /tmp/some-fx-profile --screenshot proof.png --window-size=200,100 http://127.0.0.1:8124/render.html
sleep 1
cp icon-*.png /path/to/repo/public/icons/
```
