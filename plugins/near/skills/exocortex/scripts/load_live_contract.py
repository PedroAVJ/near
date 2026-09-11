#!/usr/bin/env python3
"""Load Near's collaboration contract from the current installed release."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from typing import Any


PLUGIN_ID = "near@package-manager"
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$")
REQUIRED_PATHS = {
    "skill": Path("skills/exocortex/SKILL.md"),
    "fable_contract": Path("skills/exocortex/references/fable-contract.json"),
    "near_voice": Path("skills/exocortex/references/near-voice.md"),
}


class ContractError(RuntimeError):
    """Near's live contract could not be resolved safely."""


def _plugin_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _version_key(value: str) -> tuple[int, int, int, int, tuple[tuple[int, Any], ...]]:
    match = SEMVER.fullmatch(value)
    if match is None:
        raise ValueError(value)
    prerelease = match.group(4)
    prerelease_key: tuple[tuple[int, Any], ...] = tuple()
    if prerelease:
        prerelease_key = tuple(
            (0, int(part)) if part.isdigit() else (1, part)
            for part in prerelease.split(".")
        )
    return (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3)),
        1 if prerelease is None else 0,
        prerelease_key,
    )


def _manifest(root: Path) -> dict[str, Any]:
    path = root / ".codex-plugin/plugin.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ContractError(f"cannot read Near manifest at {path}: {error}") from error
    if payload.get("name") != "near" or not isinstance(payload.get("version"), str):
        raise ContractError(f"invalid Near manifest at {path}")
    return payload


def _validate_root(root: Path) -> tuple[Path, dict[str, Any]]:
    root = root.expanduser().resolve()
    manifest = _manifest(root)
    for relative in REQUIRED_PATHS.values():
        path = root / relative
        if not path.is_file():
            raise ContractError(f"Near {manifest['version']} is missing {relative}")
    return root, manifest


def _claude_installed_root(cache_root: Path) -> Path | None:
    registry = Path.home() / ".claude/plugins/installed_plugins.json"
    try:
        payload = json.loads(registry.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as error:
        raise ContractError(f"cannot read Claude's plugin registry: {error}") from error
    entries = payload.get("plugins", {}).get(PLUGIN_ID, [])
    user_entries = [entry for entry in entries if entry.get("scope") == "user"]
    if not user_entries:
        return None
    install_path = user_entries[-1].get("installPath")
    if not isinstance(install_path, str):
        raise ContractError("Claude's Near installation has no installPath")
    candidate = Path(install_path).expanduser().resolve()
    try:
        candidate.relative_to(cache_root.resolve())
    except ValueError as error:
        raise ContractError("Claude's Near installPath is outside its package-manager cache") from error
    return candidate


def _newest_valid_cache_root(cache_root: Path) -> Path | None:
    if not cache_root.is_dir():
        return None
    candidates: list[tuple[tuple[int, int, int, int, tuple[tuple[int, Any], ...]], Path]] = []
    for child in cache_root.iterdir():
        if not child.is_dir():
            continue
        try:
            version_key = _version_key(child.name)
            root, manifest = _validate_root(child)
        except (ValueError, ContractError):
            continue
        if manifest["version"] != child.name:
            continue
        candidates.append((version_key, root))
    return max(candidates, default=(None, None), key=lambda item: item[0])[1]


def _default_cache_root(loaded_root: Path) -> tuple[str, Path] | None:
    parts = loaded_root.parts
    for client in ("codex", "claude"):
        marker = f".{client}"
        if marker in parts:
            home_index = parts.index(marker)
            client_home = Path(*parts[: home_index + 1])
            expected = client_home / "plugins/cache/package-manager/near"
            try:
                loaded_root.relative_to(expected)
            except ValueError:
                continue
            return client, expected
    return None


def resolve_live_root(cache_root_override: Path | None = None) -> tuple[str, Path, dict[str, Any]]:
    loaded_root = _plugin_root()
    if cache_root_override is not None:
        live_root = _newest_valid_cache_root(cache_root_override.expanduser().resolve())
        if live_root is None:
            raise ContractError("no valid Near release exists in the supplied cache root")
        root, manifest = _validate_root(live_root)
        return "override", root, manifest

    cache = _default_cache_root(loaded_root)
    if cache is None:
        root, manifest = _validate_root(loaded_root)
        return "source", root, manifest

    client, cache_root = cache
    live_root = _claude_installed_root(cache_root) if client == "claude" else None
    if live_root is None:
        live_root = _newest_valid_cache_root(cache_root)
    if live_root is None:
        raise ContractError(f"no valid installed Near release exists for {client}")
    root, manifest = _validate_root(live_root)
    return client, root, manifest


def _read_text(root: Path, key: str) -> str:
    return (root / REQUIRED_PATHS[key]).read_text(encoding="utf-8")


def load_contract(cache_root_override: Path | None = None) -> dict[str, Any]:
    client, root, manifest = resolve_live_root(cache_root_override)
    skill = _read_text(root, "skill")
    fable_text = _read_text(root, "fable_contract")
    near_voice = _read_text(root, "near_voice")
    try:
        fable_contract = json.loads(fable_text)
    except json.JSONDecodeError as error:
        raise ContractError(f"Near's Fable contract is invalid JSON: {error}") from error
    digest = hashlib.sha256(
        (skill + "\0" + fable_text + "\0" + near_voice).encode("utf-8")
    ).hexdigest()
    return {
        "protocol_version": 1,
        "client": client,
        "version": manifest["version"],
        "plugin_root": str(root),
        "contract_sha256": digest,
        "skill": skill,
        "fable_contract": fable_contract,
        "near_voice": near_voice,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-root", type=Path, help=argparse.SUPPRESS)
    arguments = parser.parse_args()
    try:
        print(json.dumps(load_contract(arguments.cache_root), ensure_ascii=False))
    except ContractError as error:
        print(f"near live contract: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
