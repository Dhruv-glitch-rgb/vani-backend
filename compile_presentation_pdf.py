import os
from PIL import Image

def create_pdf_from_slides():
    slide_files = [f"slides_export/slide_{i:02d}.png" for i in range(1, 13)]
    images = []
    
    for f in slide_files:
        if os.path.exists(f):
            img = Image.open(f).convert("RGB")
            images.append(img)
            
    if images:
        output_pdf = "VANI_xAI_Light_Presentation.pdf"
        images[0].save(
            output_pdf,
            save_all=True,
            append_images=images[1:],
            resolution=150.0,
            quality=95
        )
        print(f"Successfully compiled {len(images)} slides into: {output_pdf}")

if __name__ == "__main__":
    create_pdf_from_slides()
