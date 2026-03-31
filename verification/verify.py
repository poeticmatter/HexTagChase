from playwright.sync_api import sync_playwright
import re

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context1 = browser.new_context(viewport={'width': 1200, 'height': 800})
        context2 = browser.new_context(viewport={'width': 1200, 'height': 800})

        page1 = context1.new_page()
        page1.goto("http://localhost:3000/Parralex/")
        page1.get_by_text("Create Game").click()
        page1.wait_for_timeout(2000)

        all_text = page1.locator("body").inner_text()
        match = re.search(r'(http://localhost:3000[^\s]+)', all_text)
        if match:
            room_url = match.group(1)

            page2 = context2.new_page()
            page2.goto(room_url)
            page2.wait_for_timeout(2000)

            page1.mouse.click(500, 400)
            page1.wait_for_timeout(500)

            page1.mouse.click(700, 500)
            page1.wait_for_timeout(500)

            # Scroll down to capture the button
            page1.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page1.wait_for_timeout(500)

            page1.screenshot(path="verification/screenshot5.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify_frontend()
