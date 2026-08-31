import os
from playwright.sync_api import sync_playwright

def render_front_page_pdf():
    input_html = os.path.abspath("front_page.html")
    output_pdf = os.path.abspath("VANI_xAI_Project_Front_Page.pdf")
    
    print(f"Rendering {input_html} -> {output_pdf}...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"file:///{input_html.replace(os.sep, '/')}", wait_until="networkidle")
        
        # Save A4 PDF with exact dimensions
        page.pdf(
            path=output_pdf,
            format="A4",
            print_background=True,
            margin={"top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm"}
        )
        browser.close()
    
    print(f"Successfully generated Front Page PDF: {output_pdf}")

if __name__ == "__main__":
    render_front_page_pdf()
