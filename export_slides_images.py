import os
from playwright.sync_api import sync_playwright

def render_presentation_pdf():
    input_html = os.path.abspath("vani_presentation_light.html")
    output_pdf = os.path.abspath("VANI_xAI_Light_Presentation.pdf")
    
    print(f"Rendering slides from {input_html}...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(f"file:///{input_html.replace(os.sep, '/')}", wait_until="networkidle")
        
        # We can capture screenshots of each slide or evaluate JS to render multi-slide printable document
        # Let's create a combined multi-slide printable HTML
        total_slides = page.evaluate("totalSlides")
        print(f"Total slides found: {total_slides}")

        slide_images = []
        os.makedirs("slides_export", exist_ok=True)
        for i in range(1, total_slides + 1):
            page.evaluate(f"goToSlide({i})")
            page.wait_for_timeout(300)
            element = page.locator("#slideViewport")
            img_path = f"slides_export/slide_{i:02d}.png"
            element.screenshot(path=img_path)
            slide_images.append(img_path)
            print(f"Captured Slide {i:02d} -> {img_path}")

        browser.close()
        
    print(f"All {len(slide_images)} slides captured successfully!")

if __name__ == "__main__":
    render_presentation_pdf()
