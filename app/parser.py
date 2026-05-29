import json
import tomllib
import yaml
import xmltodict
from typing import Literal

MarkupFormat = Literal["json", "yaml", "xml", "toml", "auto"]


def detect_format(raw: str) -> Literal["json", "yaml", "xml", "toml"]:
    t = raw.strip()
    if t.startswith("<"):
        return "xml"
    if t.startswith("{") or t.startswith("["):
        return "json"
    first_line = next((l.strip() for l in t.splitlines() if l.strip() and not l.strip().startswith("#")), "")
    if first_line and "=" in first_line and not first_line.startswith("-") and ":" not in first_line.split("=")[0]:
        return "toml"
    return "yaml"


def parse_markup(raw: str, fmt: MarkupFormat) -> dict:
    """Parse a raw markup string into a plain dict."""
    if fmt == "auto":
        fmt = detect_format(raw)

    if fmt == "json":
        return json.loads(raw)

    if fmt == "yaml":
        result = yaml.safe_load(raw)
        if not isinstance(result, dict):
            raise ValueError("YAML must deserialize to a mapping")
        return result

    if fmt == "toml":
        return tomllib.loads(raw)

    if fmt == "xml":
        parsed = xmltodict.parse(raw)
        # Unwrap a single root element (e.g. <loan>...</loan> → the inner dict)
        if len(parsed) == 1:
            inner = next(iter(parsed.values()))
            if isinstance(inner, dict):
                return _coerce_types(inner)
            return parsed
        return _coerce_types(parsed)

    raise ValueError(f"Unsupported format: {fmt}")


def _coerce_types(d: dict) -> dict:
    """xmltodict returns everything as strings — coerce numbers and booleans."""
    result = {}
    for k, v in d.items():
        if isinstance(v, dict):
            result[k] = _coerce_types(v)
        elif isinstance(v, str):
            result[k] = _coerce_scalar(v)
        else:
            result[k] = v
    return result


def _coerce_scalar(v: str):
    if v.lower() == "true":
        return True
    if v.lower() == "false":
        return False
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    return v
