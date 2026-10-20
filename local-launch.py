from pathlib import Path
import subprocess, urllib.request, json, time, sys, shutil, os, hashlib

root = Path(__file__).resolve().parent
port = int(os.environ.get('VVVEB_PORT', '8787'))
if not 1024 <= port <= 65535:
    raise SystemExit('شمارهٔ درگاه معتبر نیست.')
url = 'http://127.0.0.1:' + str(port)

def ready():
    try:
        with urllib.request.urlopen(url + '/health', timeout=1) as response:
            info = json.load(response)
            token_file = root / '.local-launch-token'
            return info.get('app') == 'vvvebjs-local' and token_file.exists() and info.get('instance') == hashlib.sha256(token_file.read_bytes().strip()).hexdigest()[:16]
    except Exception:
        return False

def ensure_server():
    if ready():
        return
    node = os.environ.get('VVVEB_NODE') or shutil.which('node') or next((p for p in ['/opt/homebrew/bin/node', '/usr/local/bin/node'] if Path(p).is_file()), None)
    if not node:
        raise RuntimeError('Node.js نسخهٔ ۲۲ یا بالاتر را نصب کنید.')
    try:
        with urllib.request.urlopen(url + '/health', timeout=1):
            raise RuntimeError('نسخهٔ دیگری از برنامه روی این درگاه باز است. آن را ببندید یا VVVEB_PORT را تغییر دهید.')
    except (urllib.error.URLError, TimeoutError):
        pass
    with (root / 'local-server.log').open('ab') as log:
        process = subprocess.Popen([node, str(root / 'local-server.cjs')], cwd=root, stdout=log, stderr=log, start_new_session=True)
    (root / 'local-server.pid').write_text(str(process.pid))
    for _ in range(40):
        if ready():
            return
        time.sleep(.2)
    raise RuntimeError('اجرای برنامه انجام نشد. برنامه را دوباره باز کنید.')

def prepare_file(name):
    source = Path(name).expanduser().resolve(strict=True)
    if not source.is_file() or source.suffix.lower() not in ('.html', '.htm'):
        raise ValueError('یک فایل HTML یا HTM انتخاب کنید.')
    token = (root / '.local-launch-token').read_text().strip()
    request = urllib.request.Request(url + '/api/docs/register', data=json.dumps({'path': str(source)}).encode(), headers={'Origin': url, 'Content-Type': 'application/json', 'X-Vvveb-Launch-Token': token})
    with urllib.request.urlopen(request, timeout=60) as response:
        return url + json.load(response)['url']

def main():
    ensure_server()
    targets = [prepare_file(name) for name in sys.argv[1:]] if len(sys.argv) > 1 else [url]
    for target in targets:
        subprocess.run(['/usr/bin/open', '-a', 'Google Chrome', target], check=True)

if __name__ == '__main__':
    main()
