import os
from render_front_page_pdf import render_front_page_pdf
from render_full_report_pdf import render_full_report_pdf
from generate_vani_ncsc_pptx import build_ncsc_presentation
from export_slides_images import render_presentation_pdf
from compile_presentation_pdf import create_pdf_from_slides

def main():
    print("=== 1. Building Official NCSC PPTX Presentation ===")
    build_ncsc_presentation()
    
    print("\n=== 2. Rendering Front Page PDF ===")
    render_front_page_pdf()
    
    print("\n=== 3. Rendering Full Project Report PDF ===")
    render_full_report_pdf()
    
    print("\n=== 4. Exporting Web Presentation Slide Images & PDF ===")
    render_presentation_pdf()
    create_pdf_from_slides()
    
    print("\n[SUCCESS] All NCSC 2026-27 Light UI assets built successfully with official Bureau logo!")

if __name__ == "__main__":
    main()
