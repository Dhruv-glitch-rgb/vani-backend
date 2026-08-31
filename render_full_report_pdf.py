import os
from playwright.sync_api import sync_playwright

def render_full_report_pdf():
    input_html = os.path.abspath("project_report_light.html")
    output_pdf = os.path.abspath("VANI_xAI_NCSC_Project_Report_Light.pdf")
    
    print(f"Rendering {input_html} -> {output_pdf}...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"file:///{input_html.replace(os.sep, '/')}", wait_until="networkidle")
        
        page.pdf(
            path=output_pdf,
            format="A4",
            print_background=True,
            margin={"top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm"}
        )
        browser.close()
    
    print(f"Successfully generated Full Report PDF: {output_pdf}")

if __name__ == "__main__":
    render_full_report_pdf()
