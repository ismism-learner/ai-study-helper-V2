from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

def create_test_pdf():
    pdf_path = "test_two_pages.pdf"
    c = canvas.Canvas(pdf_path, pagesize=letter)
    width, height = letter
    
    c.setFontSize(24)
    c.drawString(100, height - 100, "This is Page 1")
    c.setFontSize(16)
    c.drawString(100, height - 150, "This is the first page of the test PDF.")
    c.drawString(100, height - 180, "You can create notes on this page.")
    c.showPage()
    
    c.setFontSize(24)
    c.drawString(100, height - 100, "This is Page 2")
    c.setFontSize(16)
    c.drawString(100, height - 150, "This is the second page of the test PDF.")
    c.drawString(100, height - 180, "When you scroll to this page, the notes panel should show 'Page 2'.")
    c.showPage()
    
    c.save()
    print(f"Created test PDF at: {pdf_path}")

if __name__ == "__main__":
    create_test_pdf()
