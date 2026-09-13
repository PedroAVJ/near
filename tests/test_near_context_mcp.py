import importlib.util
import unittest
import tempfile
import json
from pathlib import Path
from unittest import mock


SERVER = (
    Path(__file__).resolve().parents[1]
    / "plugins"
    / "near"
    / "servers"
    / "near_context_mcp.py"
)


def _load_server():
    spec = importlib.util.spec_from_file_location("near_context_mcp", SERVER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NearContextMcpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = mock.patch.dict("os.environ", {"NEAR_CONTEXT_REPO": "example-owner/context"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.server = _load_server()

    def test_unconfigured_repository_fails_before_network(self) -> None:
        with mock.patch.dict("os.environ", {"NEAR_CONTEXT_CONFIG": "/nonexistent/near-config.json"}, clear=True), mock.patch.object(self.server, "_gh") as gh:
            for operation, argument in [(self.server.search_context, "topic"), (self.server.read_context, "ideas/topic.md")]:
                with self.assertRaisesRegex(self.server.NearContextError, "NEAR_CONTEXT_REPO"):
                    operation(argument)
            gh.assert_not_called()

    def test_default_branch_is_discovered_and_escaped(self) -> None:
        with mock.patch.dict("os.environ", {"NEAR_CONTEXT_REPO": "example-owner/context"}, clear=True), mock.patch.object(
            self.server, "_gh_json", side_effect=[{"default_branch": "notes/current"}, {"sha": "c" * 40}]
        ) as gh:
            self.assertEqual("c" * 40, self.server._main_sha())
            self.assertEqual(["repos/example-owner/context/commits/notes%2Fcurrent"], gh.call_args.args[0])

    def test_private_local_configuration_and_explicit_environment_override(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "context.json"
            config.write_text(json.dumps({"repository": "example-owner/local-context"}))
            with mock.patch.dict("os.environ", {"NEAR_CONTEXT_CONFIG": str(config)}, clear=True):
                self.assertEqual("example-owner/local-context", self.server._repository())
                with mock.patch.dict("os.environ", {"NEAR_CONTEXT_REPO": "other-owner/explicit-context"}):
                    self.assertEqual("other-owner/explicit-context", self.server._repository())

    def test_private_configuration_adds_only_exact_read_roots(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "context.json"
            config.write_text(json.dumps({
                "repository": "example-owner/local-context",
                "additional_read_roots": ["medical-records/me/", "relationship-records/"],
            }))
            with mock.patch.dict("os.environ", {"NEAR_CONTEXT_CONFIG": str(config)}, clear=True):
                self.assertEqual(
                    "medical-records/me/summary.md",
                    self.server._normalize_path("medical-records/me/summary.md"),
                )
                self.assertEqual(
                    "relationship-records/couple.md",
                    self.server._normalize_path("relationship-records/couple.md"),
                )
                with self.assertRaises(self.server.NearContextError):
                    self.server._normalize_path("medical-records/other/summary.md")

    def test_repository_environment_override_does_not_inherit_configured_roots(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "context.json"
            config.write_text(json.dumps({
                "repository": "example-owner/local-context",
                "additional_read_roots": ["medical-records/me/"],
            }))
            with mock.patch.dict("os.environ", {
                "NEAR_CONTEXT_CONFIG": str(config),
                "NEAR_CONTEXT_REPO": "other-owner/explicit-context",
            }, clear=True):
                with self.assertRaises(self.server.NearContextError):
                    self.server._normalize_path("medical-records/me/summary.md")

    def test_invalid_additional_read_roots_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "context.json"
            for roots in ("medical-records/me/", ["../medical-records/me/"], [""]):
                config.write_text(json.dumps({
                    "repository": "example-owner/local-context",
                    "additional_read_roots": roots,
                }))
                with mock.patch.dict("os.environ", {"NEAR_CONTEXT_CONFIG": str(config)}, clear=True):
                    with self.assertRaises(self.server.NearContextError):
                        self.server._normalize_path("ideas/sample-idea.md")

    def test_scope_allows_context_and_rejects_sensitive_or_traversal_paths(self) -> None:
        self.assertEqual(
            "ideas/sample-idea.md",
            self.server._normalize_path("ideas/sample-idea.md"),
        )
        for path in (
            "medical-records/private.md",
            "confidential/private.md",
            "ideas/../medical-records/private.md",
            "/ideas/value.md",
            "ideas/image.png",
        ):
            with self.assertRaises(self.server.NearContextError):
                self.server._normalize_path(path)

    def test_search_filters_disallowed_results_before_returning_them(self) -> None:
        search_payload = {
            "items": [
                {
                    "path": "medical-records/private.md",
                    "text_matches": [{"fragment": "never expose"}],
                },
                {
                    "path": "ideas/sample-idea.md",
                    "text_matches": [{"fragment": "This is my example"}],
                },
            ]
        }
        with mock.patch.object(
            self.server, "_gh_json", side_effect=[search_payload, {"default_branch": "main"}, {"sha": "a" * 40}]
        ):
            result = self.server.search_context("example")
        self.assertEqual(
            ["ideas/sample-idea.md"],
            [item["path"] for item in result["results"]],
        )
        self.assertNotIn("never expose", str(result))

    def test_read_is_commit_pinned_and_bounded(self) -> None:
        with mock.patch.object(self.server, "_main_sha", return_value="b" * 40), mock.patch.object(
            self.server, "_gh", return_value="first\nsecond\nthird\n"
        ) as gh:
            result = self.server.read_context(
                "ideas/sample-idea.md", start_line=2, max_lines=1
            )
        self.assertEqual("2: second", result["content"])
        self.assertIn("ref=" + "b" * 40, gh.call_args.args[0])

    def test_search_does_not_accept_repository_or_path_overrides(self) -> None:
        for query in ("example repo:someone/else", "example path:medical-records"):
            with self.assertRaises(self.server.NearContextError):
                self.server.search_context(query)


if __name__ == "__main__":
    unittest.main()
