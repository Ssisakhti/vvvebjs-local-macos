#!/usr/bin/env python3
"""Build the macOS launcher for this checkout; no private state enters the bundle."""
from pathlib import Path
import argparse
import json
import plistlib
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path.home() / 'Applications' / 'VvvebJs.app')
parser.add_argument('--desktop', action='store_true', help='Create a Desktop shortcut')
parser.add_argument('--no-register', action='store_true', help='Build without registering file associations')
args = parser.parse_args()
if sys.platform != 'darwin':
    parser.error('این نصب‌کننده برای مک است.')
app = args.output.expanduser().absolute()
if app.exists():
    parser.error('برنامه در این مسیر وجود دارد. برای حفظ نسخهٔ فعلی، مسیر دیگری با --output انتخاب کنید.')
app.parent.mkdir(parents=True, exist_ok=True)
# JSON quotes are also valid AppleScript string escapes for these path characters.
import shlex
command = shlex.join([sys.executable, str(root / 'local-launch.py')])
script = '''on run
    my launchEditor({})
end run
on open selectedFiles
    my launchEditor(selectedFiles)
end open
on launchEditor(selectedFiles)
    set launchCommand to %s
    repeat with selectedFile in selectedFiles
        set launchCommand to launchCommand & " " & quoted form of POSIX path of selectedFile
    end repeat
    try
        do shell script launchCommand
    on error messageText
        display alert "VvvebJs" message messageText as warning
    end try
end launchEditor
''' % json.dumps(command, ensure_ascii=False)
with tempfile.TemporaryDirectory(prefix='vvveb-install-') as folder:
    source = Path(folder) / 'launcher.applescript'
    source.write_text(script)
    subprocess.run(['/usr/bin/osacompile', '-o', str(app), str(source)], check=True)
resources = app / 'Contents' / 'Resources'
for name in ['VvvebHtml.icns', 'Icon-Credit.txt']:
    shutil.copy2(root / 'packaging' / name, resources / name)
info = app / 'Contents' / 'Info.plist'
data = plistlib.loads(info.read_bytes())
data.update({
    'CFBundleIdentifier': 'local.vvvebjs.editor',
    'CFBundleName': 'VvvebJs',
    'CFBundleIconFile': 'VvvebHtml.icns',
    'CFBundleShortVersionString': '2.0.9',
    'CFBundleVersion': '4',
    'CFBundleDocumentTypes': [{
        'CFBundleTypeName': 'HTML Document',
        'CFBundleTypeExtensions': ['html', 'htm'],
        'CFBundleTypeMIMETypes': ['text/html'],
        'CFBundleTypeRole': 'Editor',
        'LSHandlerRank': 'Alternate',
        'LSItemContentTypes': ['public.html'],
    }],
})
data.pop('CFBundleIconName', None)
info.write_bytes(plistlib.dumps(data))
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(app)], check=True)
if not args.no_register:
    subprocess.run(['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', '-f', str(app)], check=True)
if args.desktop:
    shortcut = Path.home() / 'Desktop' / 'VvvebJs.app'
    if not shortcut.exists() and not shortcut.is_symlink():
        shortcut.symlink_to(app, target_is_directory=True)
print('برنامه ساخته شد: ' + str(app))
print('پوشهٔ کد را در همین مسیر نگه دارید. برنامه از این پوشه اجرا می‌شود.')
