Add-Content -Path script.js -Value @"


// Auto-extract GSF items button listener (added after preprocessing improvements)
(function setupAutoExtractListener() {
    const autoExtractGsfBtn = document.getElementById('scanReviewAutoExtractGsfBtn');
    if (!autoExtractGsfBtn) return;
    
    autoExtractGsfBtn.addEventListener('click', async function() {
        if (isAccountant || !scannedInvoiceReviewState?.extracted?.rawText) return;
        try {
            setScannedInvoiceReviewBusy(true);
            const items = detectItemsFromGsfText(scannedInvoiceReviewState.extracted.rawText);
            scannedInvoiceReviewState.extracted.items = items;
            renderScannedInvoiceReviewItems();
            showNotification(`\u2705 Extracted \${items.length} items from invoice text`, 'success');
        } catch (err) {
            console.error('Auto-extract GSF items failed:', err);
            showNotification('\u274c Could not extract items from text', 'error');
        } finally {
            setScannedInvoiceReviewBusy(false);
        }
    });
})();
"@
