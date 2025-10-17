"""Temporary Coverweb browser controlled by the dashboard, never by the scraper.

stdin/stdout are a private JSON protocol. Do not forward this output to logs.
The person controls login and CAPTCHA; only the final session is persisted.
"""
import base64
import json
import re
import sys
from playwright.sync_api import sync_playwright
from scraper import BASE_URL, CATALOG_PATH, SESSION_FILE, atomic_json

KEYS = {"Tab", "Enter", "Backspace", "Delete", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Control+A"}


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(viewport={"width": 1000, "height": 720})
            page = context.new_page()
            page.goto(BASE_URL + CATALOG_PATH, wait_until="domcontentloaded", timeout=45000)
            print(json.dumps({"id": 0, "ok": True}), flush=True)
            for line in sys.stdin:
                request = json.loads(line)
                request_id = request.get("id")
                op = request.get("op")
                try:
                    if op in {"click", "type", "key", "scroll"} and page.locator("#token-logueado").count():
                        raise ValueError()
                    if op == "frame":
                        authenticated = page.url.startswith(BASE_URL + CATALOG_PATH) and bool(page.locator("#token-logueado").count())
                        result = {"authenticated": authenticated, "image": None if authenticated else base64.b64encode(page.screenshot(type="png")).decode("ascii")}
                    elif op == "click":
                        x, y = request["x"], request["y"]
                        if not (0 <= x <= 1000 and 0 <= y <= 720):
                            raise ValueError()
                        page.mouse.click(x, y)
                        result = {}
                    elif op == "type":
                        value = request["text"]
                        if not isinstance(value, str) or len(value) > 500:
                            raise ValueError()
                        page.keyboard.insert_text(value)
                        result = {}
                    elif op == "key":
                        if request["key"] not in KEYS:
                            raise ValueError()
                        page.keyboard.press(request["key"])
                        result = {}
                    elif op == "scroll":
                        page.mouse.wheel(0, max(-720, min(720, request["delta"])))
                        result = {}
                    elif op == "complete":
                        token_field = page.locator("#token-logueado")
                        if not page.url.startswith(BASE_URL + CATALOG_PATH) or not token_field.count():
                            raise ValueError()
                        token = token_field.input_value()
                        if not re.fullmatch(r"[a-f0-9]{32}", token):
                            raise ValueError()
                        atomic_json(SESSION_FILE, {"token": token, "cookies": context.cookies(BASE_URL)}, private=True)
                        print(json.dumps({"id": request_id, "ok": True, "saved": True}), flush=True)
                        break
                    elif op == "cancel":
                        print(json.dumps({"id": request_id, "ok": True}), flush=True)
                        break
                    else:
                        raise ValueError()
                    print(json.dumps({"id": request_id, "ok": True, **result}), flush=True)
                except Exception:
                    print(json.dumps({"id": request_id, "ok": False}), flush=True)
        finally:
            browser.close()


if __name__ == "__main__":
    try:
        run()
    except Exception:
        # URLs and exception messages can contain tokens. Emit only a fixed status.
        print(json.dumps({"id": 0, "ok": False}), flush=True)
        sys.exit(1)
