# Find normalizeExtractedData line number and insert before it
$scriptFile = 'script.js'
$lines = @(Get-Content $scriptFile)

# Find the line number where normalizeExtractedData is defined
$lineNum = $null
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'function normalizeExtractedData\(extracted\)') {
        $lineNum = $i
        break
    }
}

if ($lineNum -eq $null) {
    Write-Host "Could not find normalizeExtractedData function"
    exit 1
}

$newFunction = @'

function detectItemsFromDescriptionZone(rawText) {
    // Fallback parser for items merged in description text zones
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const detectedItems = [];
    const totalsKeywords = /\b(goods|vat|total|subtotal|received|vat%|code|please make cheques|bank|tax point)\b/i;

    for (const line of lines) {
        if (shouldIgnoreItemLine(line) || totalsKeywords.test(line)) continue;
        if (!/\d/.test(line) || !/[a-z]/i.test(line)) continue;
        if (!/\d+\.\d{1,2}$/.test(line) && !/£\s*\d/.test(line)) continue;

        const moneyMatches = line.match(/\d+(?:\.\d{1,2})/g) || [];
        if (moneyMatches.length === 0) continue;

        const lineTotal = normalizeNullableNumber(moneyMatches[moneyMatches.length - 1]);
        let unitPrice = null;
        if (moneyMatches.length >= 2) {
            unitPrice = normalizeNullableNumber(moneyMatches[moneyMatches.length - 2]);
        }

        const qtyMatch = line.match(/^\s*(\d+)\s+/);
        const qty = qtyMatch ? normalizeNullableNumber(qtyMatch[1]) : null;

        if (!qty || !lineTotal) continue;

        let partNumber = null;
        let descriptionStart = 0;
        const tokens = line.substring(qtyMatch ? qtyMatch[0].length : 0).split(/\s+/);
        for (let i = 0; i < tokens.length; i++) {
            if (/^\d+\.\d{1,2}$/.test(tokens[i])) break;
            if (/^[A-Z0-9][A-Z0-9\-\/]*[A-Z0-9]$/i.test(tokens[i]) || /^[A-Z0-9]{4,}$/i.test(tokens[i])) {
                partNumber = tokens[i];
                descriptionStart = i + 1;
                break;
            }
        }

        let description = tokens.slice(descriptionStart).filter(t => !/^\d+(?:\.\d{1,2})?$/.test(t)).join(' ').trim();
        
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
'@

# Insert the function before normalizeExtractedData
$before = $lines[0..($lineNum-1)]
$after = $lines[$lineNum..($lines.Length-1)]
$newLines = @() + $before + $newFunction + $after

# Write back
Set-Content $scriptFile ($newLines -join "`n") -Encoding UTF8 -NoNewline

Write-Host "✅ Added detectItemsFromDescriptionZone function"
