import re

# Update HTML
with open('index.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Replace the scanReviewItemsHeader section to add warning and auto-extract button
old_html = r'<div class="scanReviewItemsHeader">\s+<h4 class="scanReviewItemsTitle">Items</h4>\s+<button type="button" id="scanReviewAddItemBtn" class="scanReviewAddItem">Add item</button>\s+<button type="button" id="scanReviewAutoExtractGsfBtn"[^>]*>Auto-Extract GSF Items</button>\s+</div>'

new_html = '''<div id="scanReviewItemsWarning" class="scanReviewItemsWarning" style="display:none; background:#fff3cd; border:1px solid #ffecb5; border-radius:4px; padding:12px; margin-bottom:12px; color:#856404;">
                            <p style="margin:0;">⚠️ Items not detected. You can add items manually or use Auto-Extract GSF Items to re-parse from OCR text.</p>
                        </div>
                        
                        <div class="scanReviewItemsHeader">
                            <h4 class="scanReviewItemsTitle">Items</h4>
                            <button type="button" id="scanReviewAddItemBtn" class="scanReviewAddItem">Add item</button>
                            <button type="button" id="scanReviewAutoExtractGsfBtn" class="scanReviewAction" style="margin-left:auto;" title="Re-parse items from OCR text using GSF table logic">Auto-Extract GSF Items</button>
                        </div>'''

html_content = re.sub(old_html, new_html, html_content, flags=re.DOTALL)

# Also try a simpler replacement if the above didn't work
if 'scanReviewItemsWarning' not in html_content:
    # Find and replace the simpler pattern
    old_simple = '<div class="scanReviewItemsHeader">'
    new_simple = '''<div id="scanReviewItemsWarning" class="scanReviewItemsWarning" style="display:none; background:#fff3cd; border:1px solid #ffecb5; border-radius:4px; padding:12px; margin-bottom:12px; color:#856404;">
                            <p style="margin:0;">⚠️ Items not detected. You can add items manually or use Auto-Extract GSF Items to re-parse from OCR text.</p>
                        </div>
                        
                        <div class="scanReviewItemsHeader">'''
    html_content = html_content.replace(old_simple, new_simple)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Updated index.html")

# Update script.js to add auto-extract button listener
with open('script.js', 'r', encoding='utf-8') as f:
    script_content = f.read()

# Add the auto-extract button listener after addItemBtn listener
old_listener = r"if \(addItemBtn\) \{\s+addItemBtn\.addEventListener\('click', addScannedInvoiceReviewItem\);\s+\}"

new_listener = """if (addItemBtn) {
        addItemBtn.addEventListener('click', addScannedInvoiceReviewItem);
    }

    const autoExtractGsfBtn = document.getElementById('scanReviewAutoExtractGsfBtn');
    if (autoExtractGsfBtn) {
        autoExtractGsfBtn.addEventListener('click', async () => {
            if (isAccountant || !scannedInvoiceReviewState?.extracted?.rawText) return;
            try {
                setScannedInvoiceReviewBusy(true);
                const items = detectItemsFromGsfText(scannedInvoiceReviewState.extracted.rawText);
                scannedInvoiceReviewState.extracted.items = items;
                renderScannedInvoiceReviewItems();
                showNotification(`✅ Extracted ${items.length} items from invoice text`, 'success');
            } catch (err) {
                console.error('Auto-extract GSF items failed:', err);
                showNotification('❌ Could not extract items from text', 'error');
            } finally {
                setScannedInvoiceReviewBusy(false);
            }
        });
    }"""

script_content = re.sub(old_listener, new_listener, script_content)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(script_content)

print("Updated script.js with auto-extract button listener")
