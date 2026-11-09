import hashlib
import importlib.util
import json
import plistlib
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('publish_site_release', Path(__file__).with_name('publish-site-release.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
release_notes = publisher.release_notes


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
        publisher.stage(self.site, self.archive, self.image, '0.6.3', '## English\n\n- Faster\n\n## 中文\n\n- 更快\n')
        manifest = json.loads((self.site / 'downloads/latest.json').read_text())
        self.assertEqual(manifest['version'], '0.6.3')
        self.assertEqual(manifest['notesByLanguage'], {'en': '- Faster', 'zh': '- 更快'})
        self.assertEqual(manifest['notes'], '- Faster\n\n- 更快\n', 'apps without notesByLanguage read English, then Chinese')
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


class NotesTests(unittest.TestCase):
    # Two releases' notes as they were written, one English line and its Chinese line in turn.
    ALTERNATING = ('- Importing ~/.ssh/config skips code hosting entries: the server picker and SSH 直读 skip them too.\n'
                   '- 导入 ~/.ssh/config 时跳过代码托管条目（github.com、gitlab.com、User git），它们不是服务器。\n'
                   '- Import domains from Namecheap and Porkbun.\n'
                   '- 从 Namecheap、Porkbun 导入域名，从 Hetzner、DigitalOcean、Vercel 导入服务器。\n')

    def test_alternating_notes_are_sorted_by_language(self):
        self.assertEqual(release_notes.split(self.ALTERNATING), {
            'en': '- Importing ~/.ssh/config skips code hosting entries: the server picker and SSH 直读 skip them too.\n'
                  '- Import domains from Namecheap and Porkbun.',
            'zh': '- 导入 ~/.ssh/config 时跳过代码托管条目（github.com、gitlab.com、User git），它们不是服务器。\n'
                  '- 从 Namecheap、Porkbun 导入域名，从 Hetzner、DigitalOcean、Vercel 导入服务器。'})

    def test_sections_round_trip_and_keep_continuation_lines(self):
        notes = '## English\n\n- Faster panorama,\n  and fewer clicks\n- Fixes\n\n### 中文\n- 全景更快\n'
        parts = release_notes.split(notes)
        self.assertEqual(parts, {'en': '- Faster panorama,\n  and fewer clicks\n- Fixes', 'zh': '- 全景更快'})
        self.assertEqual(release_notes.grouped(parts), '## English\n\n- Faster panorama,\n  and fewer clicks\n- Fixes\n\n## 中文\n\n- 全景更快\n')
        self.assertEqual(release_notes.split(release_notes.grouped(release_notes.split(self.ALTERNATING))), release_notes.split(self.ALTERNATING))
        self.assertEqual(release_notes.split('- Only English'), {'en': '- Only English'})

    def test_command_rewrites_the_notes_and_needs_both_languages(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'notes.md'
            path.write_text(self.ALTERNATING)
            run = lambda: subprocess.run([sys.executable, str(Path(__file__).with_name('release_notes.py')), str(path)], capture_output=True, text=True)
            self.assertEqual(run().returncode, 0)
            self.assertEqual(path.read_text(), release_notes.grouped(release_notes.split(self.ALTERNATING)))
            path.write_text('- Only English\n')
            result = run()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('中文', result.stderr)
            self.assertEqual(path.read_text(), '- Only English\n')


if __name__ == '__main__':
    unittest.main()
