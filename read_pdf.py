try:
    import fitz
    doc = fitz.open("要求.pdf")
    for page in doc:
        print(page.get_text())
except ImportError:
    print("no pymupdf")
except Exception as e:
    print(f"error: {e}")
