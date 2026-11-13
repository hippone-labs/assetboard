import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('write-sha256sums.sh')
DMG = 'Assetboard-macOS-arm64-2026.11.11.dmg'
ZIP = 'Assetboard-macOS-arm64-2026.11.11.zip'


class WriteSha256SumsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        (self.dir / DMG).write_bytes(b'disk-image-bytes')
        (self.dir / ZIP).write_bytes(b'zip-archive-bytes')

    def run_script(self, *args, check=True):
        return subprocess.run(
            ['bash', str(SCRIPT), *args],
            capture_output=True, text=True, check=check,
        )

    def test_writes_basenames_and_verifies(self):
        result = self.run_script(str(self.dir), DMG, ZIP)
        self.assertEqual(result.returncode, 0)
        self.assertIn(f'{DMG}: OK', result.stdout)
        self.assertIn(f'{ZIP}: OK', result.stdout)
        sums = (self.dir / 'SHA256SUMS.txt').read_text()
        expected = subprocess.check_output(['shasum', '-a', '256', DMG, ZIP], cwd=self.dir, text=True)
        self.assertEqual(sums, expected)
        self.assertEqual(sums, (
            f'{hashlib.sha256(b"disk-image-bytes").hexdigest()}  {DMG}\n'
            f'{hashlib.sha256(b"zip-archive-bytes").hexdigest()}  {ZIP}\n'
        ))
        self.assertNotIn('/', sums)
        # The README command still works when only the disk image is present.
        (self.dir / ZIP).unlink()
        checked = subprocess.run(
            ['shasum', '-a', '256', '-c', 'SHA256SUMS.txt', '--ignore-missing'],
            cwd=self.dir, capture_output=True, text=True, check=True,
        )
        self.assertIn(f'{DMG}: OK', checked.stdout)
        self.assertNotIn(ZIP, checked.stdout)

    def test_rejects_a_path(self):
        result = self.run_script(str(self.dir), f'./{DMG}', ZIP, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn('file names, not paths', result.stderr)
        self.assertFalse((self.dir / 'SHA256SUMS.txt').exists())

    def test_rejects_a_missing_file(self):
        (self.dir / ZIP).unlink()
        result = self.run_script(str(self.dir), DMG, ZIP, check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Missing file', result.stderr)

    def test_usage(self):
        result = self.run_script(str(self.dir), check=False)
        self.assertEqual(result.returncode, 2)
        self.assertIn('usage:', result.stderr)


if __name__ == '__main__':
    unittest.main()
