import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('publish_site_release', Path(__file__).with_name('publish-site-release.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.site = root / 'site'
        (self.site / 'downloads').mkdir(parents=True)
        (self.site / 'en').mkdir()
        page = '<a href="/downloads/Assetboard-macOS-arm64-0.6.2.zip">Download</a>' * 2 + 'v0.6.2 · macOS <a href="https://buy.stripe.com/example">Buy</a>'
        for path in ['index.html', 'en/index.html']:
            (self.site / path).write_text(page)
        (self.site / 'downloads/index.html').write_text('<ul><li>Previous release</li></ul>')
        (self.site / 'downloads/latest.json').write_text(json.dumps({'version': '0.6.2'}))
        self.archive = root / 'Assetboard-macOS-arm64-0.6.3.zip'
        self.archive.write_bytes(b'final stapled archive')

    def test_stages_final_hash_notes_and_both_pages(self):
        publisher.stage(self.site, self.archive, '0.6.3', 'Release notes')
        manifest = json.loads((self.site / 'downloads/latest.json').read_text())
        self.assertEqual(manifest['version'], '0.6.3')
        self.assertEqual(manifest['notes'], 'Release notes')
        self.assertEqual(manifest['assets'][0]['sha256'], hashlib.sha256(self.archive.read_bytes()).hexdigest())
        self.assertEqual((self.site / 'downloads' / self.archive.name).read_bytes(), self.archive.read_bytes())
        for path in ['index.html', 'en/index.html']:
            text = (self.site / path).read_text()
            self.assertEqual(text.count(self.archive.name), 2)
            self.assertIn('v0.6.3 · macOS', text)
            self.assertIn('https://buy.stripe.com/example', text)
        self.assertIn('Previous release', (self.site / 'downloads/index.html').read_text())
        with self.assertRaisesRegex(ValueError, 'newer'):
            publisher.stage(self.site, self.archive, '0.6.3', 'Repeat')

    def test_rejects_missing_notes_existing_archive_and_changed_layout(self):
        with self.assertRaisesRegex(ValueError, 'notes'):
            publisher.stage(self.site, self.archive, '0.6.3', '')
        destination = self.site / 'downloads' / self.archive.name
        destination.write_bytes(b'existing')
        with self.assertRaisesRegex(ValueError, 'immutable'):
            publisher.stage(self.site, self.archive, '0.6.3', 'Notes')
        destination.unlink()
        (self.site / 'index.html').write_text('unexpected layout')
        with self.assertRaisesRegex(ValueError, 'layout'):
            publisher.stage(self.site, self.archive, '0.6.3', 'Notes')
        self.assertFalse(destination.exists())

    def test_rejects_invalid_version_and_missing_archive(self):
        with self.assertRaisesRegex(ValueError, 'stable'):
            publisher.stage(self.site, self.archive, '../version', 'Notes')
        with self.assertRaisesRegex(ValueError, 'Archive name'):
            publisher.stage(self.site, self.archive, '0.6.4', 'Notes')


if __name__ == '__main__':
    unittest.main()
