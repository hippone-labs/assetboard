import hashlib
import importlib.util
import json
import plistlib
import shutil
import tempfile
import unittest
import zipfile
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
        page = '<a href="/downloads/Assetboard-macOS-arm64-0.6.2.zip">Download</a>' * 2 + 'v0.6.2 · macOS 27 或更高 <a href="https://buy.stripe.com/example">Buy</a>'
        for path in ['index.html', 'en/index.html']:
            (self.site / path).write_text(page)
        (self.site / 'en/downloads').mkdir()
        for path, words in [('downloads/index.html', 'macOS 27 或更高'), ('en/downloads/index.html', 'macOS 27 or later')]:
            (self.site / path).write_text(f'<p>{words}</p><ul class="versions">\n  <li>Previous release</li></ul>')
        (self.site / 'downloads/latest.json').write_text(json.dumps({'version': '0.6.2'}))
        self.archive = root / 'Assetboard-macOS-arm64-0.6.3.zip'
        self.image = root / 'Assetboard-macOS-arm64-0.6.3.dmg'
        self.image.write_bytes(b'final stapled disk image')
        self.pack({'CFBundleShortVersionString': '0.6.3', 'LSMinimumSystemVersion': '15.0'})

    def pack(self, info):
        with zipfile.ZipFile(self.archive, 'w') as bundle:
            if info is not None:
                bundle.writestr('Assetboard.app/Contents/Info.plist', plistlib.dumps(info))
            bundle.writestr('Assetboard.app/Contents/MacOS/Assetboard', b'final stapled archive')

    def test_stages_final_hash_notes_and_both_pages(self):
        publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Release notes')
        manifest = json.loads((self.site / 'downloads/latest.json').read_text())
        self.assertEqual(manifest['version'], '0.6.3')
        self.assertEqual(manifest['notes'], 'Release notes')
        self.assertEqual(manifest['minimumSystemVersion'], '15.0')
        self.assertEqual(manifest['assets'][0]['sha256'], hashlib.sha256(self.archive.read_bytes()).hexdigest())
        self.assertEqual((self.site / 'downloads' / self.archive.name).read_bytes(), self.archive.read_bytes())
        for path in ['index.html', 'en/index.html']:
            text = (self.site / path).read_text()
            self.assertEqual(text.count(self.image.name), 2, 'the download buttons offer the disk image')
            self.assertNotIn('.zip', text)
            self.assertIn('v0.6.3 · macOS 15 或更高', text)
            self.assertIn('https://buy.stripe.com/example', text)
        self.assertEqual((self.site / 'downloads' / self.image.name).read_bytes(), self.image.read_bytes())
        self.assertEqual([a['name'] for a in manifest['assets']], [self.archive.name], 'the update reads the zip only')
        digest = hashlib.sha256(self.image.read_bytes()).hexdigest()
        for path, words in [('downloads/index.html', 'macOS 15 或更高'), ('en/downloads/index.html', 'macOS 15 or later')]:
            text = (self.site / path).read_text()
            self.assertIn(words, text)
            self.assertLess(text.index('Assetboard 0.6.3'), text.index('Previous release'))
            self.assertIn(f'<code title="{digest}">{digest[:8]}…{digest[-8:]}</code>', text)
        with self.assertRaisesRegex(ValueError, 'newer'):
            publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Repeat')

    def test_chinese_under_zh_english_at_the_root(self):
        shutil.rmtree(self.site / 'en')
        (self.site / 'zh/downloads').mkdir(parents=True)
        page = '<a href="/downloads/Assetboard-macOS-arm64-0.6.2.dmg">{}</a>' * 2 + 'v0.6.2 · macOS 27 {}'
        for path, words in [('index.html', ('Download', 'or later')), ('zh/index.html', ('下载', '或更高'))]:
            (self.site / path).write_text(page.format(words[0], words[0], words[1]))
        for path, words in [('downloads/index.html', 'macOS 27 or later'), ('zh/downloads/index.html', 'macOS 27 或更高')]:
            (self.site / path).write_text(f'<p>{words}</p><ul class="versions">\n  <li>Previous release</li></ul>')
        publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Release notes')
        self.assertIn('v0.6.3 · macOS 15 or later', (self.site / 'index.html').read_text())
        self.assertIn('v0.6.3 · macOS 15 或更高', (self.site / 'zh/index.html').read_text())
        for path in ['index.html', 'zh/index.html']:
            self.assertEqual((self.site / path).read_text().count(self.image.name), 2)
        for path, words in [('downloads/index.html', 'macOS 15 or later'), ('zh/downloads/index.html', 'macOS 15 或更高')]:
            text = (self.site / path).read_text()
            self.assertIn(words, text)
            self.assertLess(text.index('Assetboard 0.6.3'), text.index('Previous release'))
        self.assertFalse((self.site / 'en').exists())

    def test_rejects_missing_notes_existing_archive_and_changed_layout(self):
        with self.assertRaisesRegex(ValueError, 'notes'):
            publisher.stage(self.site, self.archive, self.image, '0.6.3', '')
        destination = self.site / 'downloads' / self.archive.name
        destination.write_bytes(b'existing')
        with self.assertRaisesRegex(ValueError, 'immutable'):
            publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Notes')
        destination.unlink()
        image_destination = self.site / 'downloads' / self.image.name
        image_destination.write_bytes(b'existing')
        with self.assertRaisesRegex(ValueError, 'immutable'):
            publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Notes')
        image_destination.unlink()
        with self.assertRaisesRegex(ValueError, 'Disk image name'):
            publisher.stage(self.site, self.archive, self.archive, '0.6.3', 'Notes')
        (self.site / 'index.html').write_text('unexpected layout')
        with self.assertRaisesRegex(ValueError, 'layout'):
            publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Notes')
        self.assertFalse(destination.exists())

    def test_minimum_system_comes_from_the_app_in_the_archive(self):
        for info, message in [(None, 'Info.plist'), ({'CFBundleShortVersionString': '0.6.2', 'LSMinimumSystemVersion': '15.0'}, 'CFBundleShortVersionString'),
                              ({'CFBundleShortVersionString': '0.6.3'}, 'LSMinimumSystemVersion'),
                              ({'CFBundleShortVersionString': '0.6.3', 'LSMinimumSystemVersion': 'fifteen'}, 'LSMinimumSystemVersion')]:
            self.pack(info)
            with self.assertRaisesRegex(ValueError, message):
                publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Notes')
            self.assertFalse((self.site / 'downloads' / self.archive.name).exists())
        self.archive.write_bytes(b'not a zip')
        with self.assertRaisesRegex(ValueError, 'Info.plist'):
            publisher.stage(self.site, self.archive, self.image, '0.6.3', 'Notes')

    def test_rejects_invalid_version_and_missing_archive(self):
        with self.assertRaisesRegex(ValueError, 'stable'):
            publisher.stage(self.site, self.archive, self.image, '../version', 'Notes')
        with self.assertRaisesRegex(ValueError, 'Archive name'):
            publisher.stage(self.site, self.archive, self.image, '0.6.4', 'Notes')


if __name__ == '__main__':
    unittest.main()
