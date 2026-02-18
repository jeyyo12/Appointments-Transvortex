#!/usr/bin/env python3
import re

# Read script.js
with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Insert the new description-zone parser function
new_function = '''

function detectItemsFromDescriptionZone(rawText) {
    // Fallback parser for items merged in description text zones
    // Scans OCR text for lines with qty + partNumber + description + prices
    const lines = String(rawText || '')
        .split(/\\r?\\n/)
        .map((line) => line.replace(/\\s+/g, ' ').trim())
        .filter(Boolean);

    const detectedItems = [];
    const totalsKeywords = /\\b(goods|vat|total|subtotal|received|vat%|code|please make cheques|bank|tax point)\\b/i;

    for (const line of lines) {
        if (shouldIgnoreItemLine(line) || totalsKeywords.test(line)) continue;
        if (!/\\d/.test(line) || !/[a-z]/i.test(line)) continue;
        if (!/\\d+\\.\\d{1,2}$/.test(line) && !/£\\s*\\d/.test(line)) continue;

        const moneyMatches = line.match(/\\d+(?:\\.\\d{1,2})/g) || [];
        if (moneyMatches.length === 0) continue;

        const lineTotal = normalizeNullableNumber(moneyMatches[moneyMatches.length - 1]);
        let unitPrice = null;
        if (moneyMatches.length >= 2) {
            unitPrice = normalizeNullableNumber(moneyMatches[moneyMatches.length - 2]);
        }

        const qtyMatch = line.match(/^\\s*(\\d+)\\s+/);
        const qty = qtyMatch ? normalizeNullableNumber(qtyMatch[1]) : null;

        if (!qty || !lineTotal) continue;

        let partNumber = null;
        let descriptionStart = 0;
        const tokens = line.substring(qtyMatch ? qtyMatch[0].length : 0).split(/\\s+/);
        for (let i = 0; i < tokens.length; i++) {
            if (/^\\d+\\.\\d{1,2}$/.test(tokens[i])) break;
            if (/^[A-Z0-9][A-Z0-9\\-\\/]*[A-Z0-9]$/i.test(tokens[i]) || /^[A-Z0-9]{4,}$/i.test(tokens[i])) {
                partNumber = tokens[i];
                descriptionStart = i + 1;
                break;
            }
        }

        let description = tokens
            .slice(descriptionStart)
            .filter(t => !/^\\d+(?:\\.\\d{1,2})?$/.test(t))
            .join(' ')
            .trim();

        if (description && lineTotal !== null) {
            detectedItems.push({
                qty,
                partNumber: partNumber || null,
                description,
                unitPrice,
                lineTotal
            });
        }

        if (detectedItems.length >= 50) break;
    }
    return detectedItems;
}
'''

# Find the insertion point (right before normalizeExtractedData)
pattern = r'\n    return detectedItems;\n}\n\nfunction normalizeExtractedData\(extracted\) {'
replacement = f'{new_function}\n    return detectedItems;\n}}\n\nfunction normalizeExtractedData(extracted) {{'

content = re.sub(pattern, replacement, content)

# Now update extractInvoiceDataFromRawText to use the fallback parser
# Find the section where items are extracted and add fallback logic
old_items_extract = r"items: gsfDetected \? detectItemsFromGsfText\(safeRawText\) : detectItemsFromText\(safeRawText\)"
new_items_extract = """items: gsfDetected ? detectItemsFromGsfText(safeRawText) || detectItemsFromDescriptionZone(safeRawText) : detectItemsFromText(safeRawText)"""

content = re.sub(old_items_extract, new_items_extract, content)

# Write back to script.js
with open('script.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Added detectItemsFromDescriptionZone function")
print("✅ Updated extractInvoiceDataFromRawText to use fallback parser")
