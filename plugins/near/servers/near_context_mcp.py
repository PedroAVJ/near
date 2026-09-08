#!/usr/bin/env python3
"""Read-only MCP access to the user's configured canonical Near context."""

from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
from typing import Any
from urllib.parse import quote



SERVER_VERSION = "0.8.3"
ALLOWED_ROOTS = ("ideas/", "canon/", "context/", "career/", "docs/project/", "public/")
ALLOWED_SUFFIXES = (".md", ".txt", ".json", ".yaml", ".yml")
MAX_QUERY_LENGTH = 120
MAX_RESULTS = 8
MAX_LINES = 120
MAX_FILE_BYTES = 256 * 1024


class NearContextError(RuntimeError):
    """The bounded Near context operation could not be completed."""


def _repository() -> str:
    value = os.environ.get("NEAR_CONTEXT_REPO", "").strip()
    if not value:
        configured_path = os.environ.get("NEAR_CONTEXT_CONFIG")
        config_path = (pathlib.Path(configured_path).expanduser() if configured_path
                       else pathlib.Path.home() / ".config" / "near" / "context.json")
        if config_path.exists():
            try:
                payload = json.loads(config_path.read_text(encoding="utf-8"))
                value = payload.get("repository", "") if isinstance(payload, dict) else ""
            except (OSError, json.JSONDecodeError) as error:
                raise NearContextError("The local Near context configuration could not be read") from error
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+", value):
        raise NearContextError("Set NEAR_CONTEXT_REPO or configure your chosen repository in ~/.config/near/context.json before reading context")
    return value


def _ref() -> str:
    payload = _gh_json([f"repos/{_repository()}"])
    branch = payload.get("default_branch") if isinstance(payload, dict) else None
    if not isinstance(branch, str) or not branch:
        raise NearContextError("The configured repository has no default branch")
    return branch


def _audit(event: str, **details: Any) -> None:
    destination = os.environ.get("NEAR_CONTEXT_AUDIT_FILE")
    if not destination:
        return
    path = pathlib.Path(destination).expanduser()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"event": event, **details}, separators=(",", ":")) + "\n")
    path.chmod(0o600)


def _gh(arguments: list[str], *, accept: str | None = None) -> str:
    gh = shutil.which("gh")
    if gh is None:
        raise NearContextError("GitHub CLI is unavailable")
    command = [gh, "api", *arguments]
    if accept:
        command.extend(["-H", f"Accept: {accept}"])
    completed = subprocess.run(
        command,
        text=True,
        capture_output=True,
        check=False,
        env=os.environ.copy(),
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()
        suffix = f": {detail[-1]}" if detail else ""
        raise NearContextError(f"GitHub rejected the read-only Near request{suffix}")
    return completed.stdout


def _gh_json(arguments: list[str], *, accept: str | None = None) -> Any:
    try:
        return json.loads(_gh(arguments, accept=accept))
    except json.JSONDecodeError as error:
        raise NearContextError("GitHub returned invalid JSON") from error


def _normalize_path(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise NearContextError("path is required")
    candidate = value.strip().replace("\\", "/")
    pure = pathlib.PurePosixPath(candidate)
    if pure.is_absolute() or ".." in pure.parts or candidate != pure.as_posix():
        raise NearContextError("path must be a normalized repository-relative path")
    if not candidate.startswith(ALLOWED_ROOTS) or not candidate.lower().endswith(ALLOWED_SUFFIXES):
        raise NearContextError(
            "path is outside the configured Near context roots"
        )
    return candidate


def _validate_query(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise NearContextError("query is required")
    query = " ".join(value.split())
    if len(query) > MAX_QUERY_LENGTH:
        raise NearContextError(f"query must be at most {MAX_QUERY_LENGTH} characters")
    lowered = query.lower()
    if any(qualifier in lowered for qualifier in ("repo:", "org:", "user:", "path:")):
        raise NearContextError("repository and path qualifiers are not accepted")
    return query


def _main_sha() -> str:
    payload = _gh_json([f"repos/{_repository()}/commits/{quote(_ref(), safe='')}"])
    sha = payload.get("sha") if isinstance(payload, dict) else None
    if not isinstance(sha, str) or len(sha) < 12:
        raise NearContextError("Near ref did not resolve to a commit")
    return sha


def search_context(query: Any, max_results: Any = 5) -> dict[str, Any]:
    _repository()  # Fail closed before invoking GitHub when unconfigured.
    clean_query = _validate_query(query)
    if isinstance(max_results, bool) or not isinstance(max_results, int):
        raise NearContextError("max_results must be an integer")
    limit = min(max(max_results, 1), MAX_RESULTS)
    payload = _gh_json(
        [
            "-X",
            "GET",
            "search/code",
            "-f",
            f"q={clean_query} repo:{_repository()}",
            "-f",
            f"per_page={min(limit * 4, 32)}",
        ],
        accept="application/vnd.github.text-match+json",
    )
    items = payload.get("items", []) if isinstance(payload, dict) else []
    results: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            path = _normalize_path(item.get("path"))
        except NearContextError:
            continue
        fragments: list[str] = []
        for match in item.get("text_matches", []):
            if not isinstance(match, dict):
                continue
            fragment = match.get("fragment")
            if isinstance(fragment, str) and fragment.strip():
                fragments.append(fragment.strip()[:1200])
        results.append({"path": path, "fragments": fragments[:3]})
        if len(results) >= limit:
            break
    sha = _main_sha()
    _audit("search", result_count=len(results), ref=sha)
    return {
        "repository": _repository(),
        "ref": sha,
        "scope": "configured personal context",
        "results": results,
    }


def read_context(path: Any, start_line: Any = 1, max_lines: Any = 80) -> dict[str, Any]:
    _repository()  # Fail closed before invoking GitHub when unconfigured.
    clean_path = _normalize_path(path)
    if isinstance(start_line, bool) or not isinstance(start_line, int) or start_line < 1:
        raise NearContextError("start_line must be a positive integer")
    if isinstance(max_lines, bool) or not isinstance(max_lines, int):
        raise NearContextError("max_lines must be an integer")
    line_limit = min(max(max_lines, 1), MAX_LINES)
    sha = _main_sha()
    encoded_path = quote(clean_path, safe="/")
    content = _gh(
        ["-X", "GET", f"repos/{_repository()}/contents/{encoded_path}", "-f", f"ref={sha}"],
        accept="application/vnd.github.raw+json",
    )
    if len(content.encode("utf-8")) > MAX_FILE_BYTES:
        raise NearContextError("Near context file exceeds the bounded read limit")
    lines = content.splitlines()
    selected = lines[start_line - 1 : start_line - 1 + line_limit]
    numbered = "\n".join(
        f"{number}: {line}" for number, line in enumerate(selected, start=start_line)
    )
    _audit("read", line_count=len(selected), ref=sha)
    return {
        "repository": _repository(),
        "ref": sha,
        "path": clean_path,
        "start_line": start_line,
        "line_count": len(selected),
        "content": numbered,
    }


TOOLS = [
    {
        "name": "search_context",
        "description": (
            "Search the user's canonical Near for established configured personal context such as "
            "ideas, values, career thinking, decisions, or project conclusions. Use concise keywords."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Concise search keywords."},
                "max_results": {"type": "integer", "minimum": 1, "maximum": MAX_RESULTS},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "read_context",
        "description": (
            "Read a bounded line range from an allowed Near path returned by search_context."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Repository-relative path from search."},
                "start_line": {"type": "integer", "minimum": 1},
                "max_lines": {"type": "integer", "minimum": 1, "maximum": MAX_LINES},
            },
            "required": ["path"],
            "additionalProperties": False,
        },
    },
]


def _tool_result(payload: dict[str, Any]) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}]}


def _handle(message: dict[str, Any]) -> dict[str, Any] | None:
    request_id = message.get("id")
    method = message.get("method")
    if request_id is None:
        return None
    if method == "initialize":
        requested = message.get("params", {}).get("protocolVersion", "2024-11-05")
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": requested,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "near-context", "version": SERVER_VERSION},
            },
        }
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = message.get("params", {})
        name = params.get("name")
        arguments = params.get("arguments", {})
        try:
            if not isinstance(arguments, dict):
                raise NearContextError("tool arguments must be an object")
            if name == "search_context":
                result = search_context(**arguments)
            elif name == "read_context":
                result = read_context(**arguments)
            else:
                raise NearContextError("unknown Near context tool")
            payload = _tool_result(result)
        except (NearContextError, TypeError) as error:
            payload = {
                "content": [{"type": "text", "text": str(error)}],
                "isError": True,
            }
        return {"jsonrpc": "2.0", "id": request_id, "result": payload}
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": "method not found"},
    }


def main() -> int:
    for raw_line in sys.stdin:
        try:
            message = json.loads(raw_line)
            response = _handle(message)
        except (json.JSONDecodeError, TypeError, AttributeError) as error:
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"invalid request: {error}"},
            }
        if response is not None:
            sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
