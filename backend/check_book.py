import fitz
import os

file_path = "uploads/books/基于python的金融分析与风险管理-第二版 (斯文) (Z-Library).pdf"

doc = fitz.open(file_path)
print(f"PDF Format: {doc.metadata.get('format', 'Unknown')}")

for i in range(min(3, len(doc))):
    page = doc[i]
    print(f"\n=== Page {i+1} ===")
    
    images = page.get_images()
    print(f"Number of images: {len(images)}")
    
    for img_idx, img in enumerate(images[:3]):
        xref = img[0]
        base_image = doc.extract_image(xref)
        print(f"  Image {img_idx+1}:")
        print(f"    Format: {base_image['ext']}")
        print(f"    Size: {base_image['width']}x{base_image['height']}")
        print(f"    Colorspace: {base_image.get('colorspace', 'N/A')}")
        print(f"    Bits per component: {base_image.get('bpc', 'N/A')}")
        
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    print(f"Page pixmap: {pix.width}x{pix.height}, n={pix.n} (channels)")

doc.close()
