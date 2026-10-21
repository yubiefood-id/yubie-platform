"""Test the fixture's pure writer without importing the Frappe runtime."""
import ast
import json
import os
from pathlib import Path
import secrets
import stat
import tempfile
import unittest
from unittest.mock import patch


class PrivateFileTest(unittest.TestCase):
    def test_permissions_are_private_before_any_secret_is_written(self):
        tree = ast.parse(Path(__file__).with_name("native_fixtures.py").read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "write_private_json")
        scope = {"json": json, "os": os, "secrets": secrets}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "fixture-writer", "exec"), scope)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "credentials.json"
            observed = []
            def checked_dump(value, stream):
                observed.append(stat.S_IMODE(os.fstat(stream.fileno()).st_mode))
                stream.write(json.dumps(value))
            with patch.object(json, "dump", side_effect=checked_dump):
                scope["write_private_json"](path, {"synthetic": "fixture"})
            self.assertEqual(observed, [0o600])
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(json.loads(path.read_text()), {"synthetic": "fixture"})
            self.assertEqual(list(path.parent.iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
