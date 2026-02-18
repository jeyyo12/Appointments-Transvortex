# Update index.html to add warning and button
$htmlFile = 'index.html'
$html = Get-Content $htmlFile -Raw -Encoding UTF8

# Find and replace the scanReviewItemsHeader section
$oldHtmlPattern = '<div class="scanReviewItemsHeader">\s+<h4 class="scanReviewItemsTitle">Items</h4>\s+<button type="button" id="scanReviewAddItemBtn" class="scanReviewAddItem">Add item</button>\s+</div>'

$newHtml = @'
<div id="scanReviewItemsWarning" class="scanReviewItemsWarning" style="display:none; background:#fff3cd; border:1px solid #ffecb5; border-radius:4px; padding:12px; margin-bottom:12px; color:#856404;">
                            <p style="margin:0;">⚠️ Items not detected. You can add items manually or use Auto-Extract GSF Items to re-parse from OCR text.</p>
                        </div>
                        
                        <div class="scanReviewItemsHeader">
                            <h4 class="scanReviewItemsTitle">Items</h4>
                            <button type="button" id="scanReviewAddItemBtn" class="scanReviewAddItem">Add item</button>
                            <button type="button" id="scanReviewAutoExtractGsfBtn" class="scanReviewAction" style="margin-left:auto;" title="Re-parse items from OCR text using GSF table logic">Auto-Extract GSF Items</button>
                        </div>
'@

$html = $html -replace [regex]::Escape('<div class="scanReviewItemsHeader">'), @'
<div id="scanReviewItemsWarning" class="scanReviewItemsWarning" style="display:none; background:#fff3cd; border:1px solid #ffecb5; border-radius:4px; padding:12px; margin-bottom:12px; color:#856404;">
                            <p style="margin:0;">⚠️ Items not detected. You can add items manually or use Auto-Extract GSF Items to re-parse from OCR text.</p>
                        </div>
                        
                        <div class="scanReviewItemsHeader">
'@

# Also add the auto-extract button if not present
if ($html -notcontain 'scanReviewAutoExtractGsfBtn') {
    $html = $html -replace '(<button type="button" id="scanReviewAddItemBtn"[^>]*>Add item</button>)', '$1
                            <button type="button" id="scanReviewAutoExtractGsfBtn" class="scanReviewAction" style="margin-left:auto;" title="Re-parse items from OCR text using GSF table logic">Auto-Extract GSF Items</button>'
}

Set-Content $htmlFile -Value $html -Encoding UTF8 -NoNewline

Write-Host "Updated index.html"
