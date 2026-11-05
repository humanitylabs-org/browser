import re
import unittest
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[1] / 'runtipi' / 'docker-compose.yml'


def service_block(text, name):
    m = re.search(r'^  %s:\n((?:    .*\n|\n)+)' % re.escape(name), text, re.M)
    return m.group(1) if m else ''


class ReaderComposeTest(unittest.TestCase):
    def test_reader_has_writable_tmp_on_read_only_root(self):
        # Playwright's connectOverCDP mkdtemps an artifacts dir in os.tmpdir(); without a
        # tmpfs every Reader request failed on the read-only root (Forum run 1, 5 Nov 2026).
        block = service_block(COMPOSE.read_text(), 'browser-reader')
        self.assertIn('read_only: true', block)
        self.assertRegex(block, r'tmpfs:\n\s+- /tmp:rw')
        self.assertIn('TMPDIR: /tmp', block)


if __name__ == '__main__':
    unittest.main()
