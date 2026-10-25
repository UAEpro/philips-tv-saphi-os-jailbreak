"""Check a clean checkout without a TV, firmware or private settings."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import native_home


class PublicBuildTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        shutil.copytree(ROOT / 'home-app', self.root / 'home-app',
                        ignore=shutil.ignore_patterns('config.local.js'))

    def test_default_runtime_is_self_contained(self):
        with patch.object(native_home, 'ROOT', self.root):
            html = native_home.home_html()
        self.assertIn('var HomeConfig', html)
        self.assertIn('enabled: false', html)
        for marker in ('APP_CONFIG', 'APP_CSS', 'APP_BRIDGE', 'APP_JS', 'NATIVE_LIBRARIES'):
            self.assertNotIn(marker, html)

    def test_local_settings_override_without_rewriting_public_defaults(self):
        default = (self.root / 'home-app/config.js').read_text()
        custom = default.replace('utcOffsetMinutes: 0', 'utcOffsetMinutes: 60')
        (self.root / 'home-app/config.local.js').write_text(custom)
        with patch.object(native_home, 'ROOT', self.root):
            html = native_home.home_html()
        self.assertIn('utcOffsetMinutes: 60', html)
        self.assertEqual((self.root / 'home-app/config.js').read_text(), default)

    def test_preview_build_needs_no_firmware(self):
        shutil.copy2(ROOT / 'build_home_app.py', self.root)
        result = subprocess.run([sys.executable, str(self.root / 'build_home_app.py')],
                                capture_output=True, text=True, check=True)
        self.assertIsNone(json.loads(result.stdout)['original_sha256'])
        self.assertTrue((self.root / 'build/preview/preview.html').exists())
        self.assertFalse((self.root / 'build/compact-home/original-index.html').exists())

    def test_addresses_are_explicit_before_any_network_operation(self):
        for script, action in (('native_home.py', 'launch'), ('native_home.py', 'recover'),
                               ('tv_control.py', 'status')):
            result = subprocess.run([sys.executable, str(ROOT / script), action],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('required', result.stderr)


if __name__ == '__main__':
    unittest.main()
