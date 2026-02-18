import re

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Update renderScannedInvoiceReviewItems to show warning
old_pattern = r"const items = scannedInvoiceReviewState\.extracted\.items \|\| \[\];\s+if \(items\.length === 0\)"

replacement = r"const items = scannedInvoiceReviewState.extracted.items || [];\n    const warningEl = document.getElementById('scanReviewItemsWarning');\n    if (items.length === 0)"

content = re.sub(old_pattern, replacement, content)

# Update the return section  in renderScannedInvoiceReviewItems
old_return = r"return;\s+\}\s+container\.innerHTML = items\.map"
new_return = r"if (warningEl) warningEl.style.display = 'block';\n        return;\n    }\n    if (warningEl) warningEl.style.display = 'none';\n\n    container.innerHTML = items.map"

content = re.sub(old_return, new_return, content)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated script.js renderScannedInvoiceReviewItems")
