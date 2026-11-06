import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("publisher", Path(__file__).with_name("publish-dist.py"))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class Store:
    def __init__(self, inventory=None, fail=None):
        self.files = inventory or {}
        self.written = []
        self.fail = fail

    def inventory(self):
        return self.files

    def put(self, name, path, checksum):
        if name == self.fail:
            raise RuntimeError("Transfer interrupted")
        self.written.append(name)
        self.files[name] = (path.stat().st_size, checksum)


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ["index.html", "sw.js", "assets/catalog.js", "music/piece.mid"]:
            path = self.root / name
            path.parent.mkdir(exist_ok=True)
            path.write_text(name)

    def test_dependencies_finish_before_entry_points_and_previous_assets_survive(self):
        store = Store({"assets/previous.js": (5, "old")})
        publisher.publish(self.root, store)
        self.assertEqual(store.written[-2:], ["index.html", "sw.js"])
        self.assertIn("assets/previous.js", store.files)
        store.written.clear()
        publisher.publish(self.root, store)
        self.assertEqual(store.written, [])
        # Same length, different content must upload; timestamps do not decide.
        (self.root / "music/piece.mid").write_text("MUSIC/PIECE.MID")
        publisher.publish(self.root, store)
        self.assertEqual(store.written, ["music/piece.mid"])

    def test_failed_dependency_keeps_active_entry_points_untouched(self):
        store = Store(fail="music/piece.mid")
        with self.assertRaises(RuntimeError):
            publisher.publish(self.root, store)
        self.assertNotIn("index.html", store.written)
        self.assertNotIn("sw.js", store.written)

    def test_opaque_etag_is_not_assumed_to_match(self):
        store = Store({"music/piece.mid": (14, "multipart-2")})
        publisher.publish(self.root, store)
        self.assertIn("music/piece.mid", store.written)


if __name__ == "__main__":
    unittest.main()
