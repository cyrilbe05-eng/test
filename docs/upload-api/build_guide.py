"""Rebuilds GUIDE-for-Anton.md from guide-template.md + pingu_upload.py.

The guide always gets the script WITHOUT the testing-only preview bypass, so
nothing about it ever reaches a client. Run: python docs/upload-api/build_guide.py
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))


def client_script(src: str) -> str:
    """The script exactly as a client should get it (testing-only lines removed)."""
    src = re.sub(r"# TESTING ONLY[^\n]*\n[^\n]*PINGU_VERCEL_BYPASS[^\n]*\n", "", src)
    src = src.replace(", **BYPASS", "")
    assert "BYPASS" not in src and "vercel" not in src.lower(), "testing-only code left in the client script"
    return src.rstrip()


if __name__ == "__main__":
    template = open(os.path.join(HERE, "guide-template.md"), encoding="utf-8").read()
    script = client_script(open(os.path.join(HERE, "pingu_upload.py"), encoding="utf-8").read())
    open(os.path.join(HERE, "GUIDE-for-Anton.md"), "w", encoding="utf-8", newline="\n").write(template.replace("{{SCRIPT}}", script))
    print("GUIDE-for-Anton.md rebuilt (", len(script.splitlines()), "script lines, no testing-only code )")
