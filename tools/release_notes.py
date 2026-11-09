#!/usr/bin/env python3
"""Release notes by language. The notes (the vX.Y.Z tag message) are two sections, "## English" and "## 中文", each a list of
changes. Notes without those headings, one English line and its Chinese line in turn, are sorted line by line: an item is Chinese
when it has at least as many Chinese characters as Latin words. desktop/Updater.swift (splitNotes) reads the version file by the
same rule.

  tools/release_notes.py notes.md    rewrites notes.md as the two sections; fails when either language is missing
"""
import re
import sys
from pathlib import Path

LANGUAGES = ("en", "zh")
TITLES = {"en": "English", "zh": "中文"}
HEADING = re.compile(r"^#{1,6}\s*(english|中文|简体中文|chinese)\s*$", re.IGNORECASE)
CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
LATIN = re.compile(r"[A-Za-z]+")


def language_of(text):
    cjk = len(CJK.findall(text))
    return "zh" if cjk and cjk >= len(LATIN.findall(text)) else "en"


def items(lines):
    """List items with their continuation lines; a blank line or a heading ends one."""
    out = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            out.append(None)
        elif out and out[-1] is not None and not re.match(r"[-*+]\s|\d+[.)]\s|#", stripped):
            out[-1] += "\n" + line.rstrip()
        else:
            out.append(line.rstrip())
    return [item for item in out if item]


def split(notes):
    """{"en": ..., "zh": ...}, each the Markdown of one language; a language the notes do not have is left out."""
    sections = {lang: [] for lang in LANGUAGES}
    section, loose = None, []
    for line in notes.splitlines():
        heading = HEADING.match(line.strip())
        if heading:
            section = "en" if heading.group(1).lower() == "english" else "zh"
        else:
            (sections[section] if section else loose).append(line)
    # Lines before any language heading (all of them in notes without headings) go to the language they are written in.
    parts = {lang: [item for item in items(loose) if language_of(item) == lang] + items(sections[lang]) for lang in LANGUAGES}
    return {lang: "\n".join(found) for lang, found in parts.items() if found}


def grouped(parts):
    """The notes as Markdown, one section per language: the tag message's form, also the GitHub Release's."""
    return "\n\n".join(f"## {TITLES[lang]}\n\n{parts[lang]}" for lang in LANGUAGES if lang in parts) + "\n"


def plain(parts):
    """English, then Chinese, without headings: the version file's "notes", which apps that predate notesByLanguage show."""
    return "\n\n".join(parts[lang] for lang in LANGUAGES if lang in parts) + "\n"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(f"usage: {sys.argv[0]} <notes.md>")
    path = Path(sys.argv[1])
    parts = split(path.read_text())
    missing = [TITLES[lang] for lang in LANGUAGES if lang not in parts]
    if missing:
        sys.exit(f"Release notes need an English and a 中文 section; missing: {', '.join(missing)}")
    path.write_text(grouped(parts))
