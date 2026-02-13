#!/usr/bin/env python3
"""Remove Invoices and Storage tabs from Transvortex app"""

import re

def remove_invoice_sections(filepath):
    """Remove invoice and storage tab sections from HTML"""
    
    # Read the file
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern to match and remove EVERYTHING from TAB 3: FACTURI comment
    # through TAB 4: INVOICES STORAGE and their closing divs
    pattern = r'\s*<!-- ============================================ -->\s*\n\s*<!-- TAB 3: FACTURI -->\s*\n\s*<!-- ============================================ -->\s*\n.*?<!-- ============================================ -->\s*\n\s*<!-- TAB 4: INVOICES STORAGE -->\s*\n\s*<!-- ============================================ -->\s*\n.*?</div>\s*\n'
    
    content_modified = re.sub(pattern, '\n', content, flags=re.DOTALL)
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content_modified)
    
    print(f"✅ Removed Invoices and Storage tab sections from {filepath}")

if __name__ == '__main__':
    remove_invoice_sections('index.html')
