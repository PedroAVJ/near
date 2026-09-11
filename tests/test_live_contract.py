import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ROOT = ROOT / "plugins" / "near"
SCRIPT = PLUGIN_ROOT / "skills" / "exocortex" / "scripts" / "load_live_contract.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("near_live_contract", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LiveContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = _load_module()

    def _release(self, cache: Path, version: str, marker: str) -> Path:
        release = cache / version
        shutil.copytree(PLUGIN_ROOT, release)
        for manifest_path in (
            release / ".codex-plugin" / "plugin.json",
            release / ".claude-plugin" / "plugin.json",
        ):
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["version"] = version
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        voice = release / "skills" / "exocortex" / "references" / "near-voice.md"
        voice.write_text(marker, encoding="utf-8")
        return release

    def test_source_checkout_loads_its_complete_contract(self) -> None:
        payload = self.module.load_contract()
        self.assertEqual("source", payload["client"])
        self.assertEqual("near", json.loads((PLUGIN_ROOT / ".codex-plugin/plugin.json").read_text())["name"])
        self.assertIn("Two-model thinking", payload["skill"])
        self.assertEqual("near-fable", payload["fable_contract"]["role"]["key"])
        self.assertEqual(64, len(payload["contract_sha256"]))

    def test_old_bootstrap_selects_newest_valid_release(self) -> None:
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            cache = Path(directory)
            self._release(cache, "0.10.2", "older voice")
            newest = self._release(cache, "0.11.0", "new live voice")
            incomplete = cache / "0.12.0"
            incomplete.mkdir()

            result = subprocess.run(
                ["python3", str(cache / "0.10.2" / "skills/exocortex/scripts/load_live_contract.py"), "--cache-root", str(cache)],
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout)

            self.assertEqual("0.11.0", payload["version"])
            self.assertEqual(str(newest.resolve()), payload["plugin_root"])
            self.assertEqual("new live voice", payload["near_voice"])

    def test_override_fails_when_no_complete_release_exists(self) -> None:
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            with self.assertRaisesRegex(self.module.ContractError, "no valid Near release"):
                self.module.load_contract(Path(directory))


if __name__ == "__main__":
    unittest.main()
