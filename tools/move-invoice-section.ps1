$f = Join-Path $PSScriptRoot '..\index.html'
$c = Get-Content $f -Raw
$nl = [Environment]::NewLine

# 1. Extract Invoice Storage block
$ci  = ${c}.IndexOf('<!-- ===== INVOICES STORAGE SECTION')
$ls  = ${c}.LastIndexOf(${nl}, ${ci}) + ${nl}.Length
$ce  = ${c}.IndexOf('<div id="scannedInvoicesTab"', ${ci})
$block = ${c}.Substring(${ls}, ${ce} - ${ls})
$blockLines = ${block}.Split(${nl}).Count
Write-Host ('Block extracted: {0} lines' -f $blockLines)

# 2. Remove block from current position (replace with nothing)
$withoutBlock = ${c}.Substring(0, ${ls}) + ${c}.Substring(${ce})

# 3. Find insertion point: inside scannedInvoicesTab, just before its closing </div>
#    Pattern: </section>\n            </div>\n\n            <div id="accountingTab"
$acctMarker = '<div id="accountingTab"'
$acctIdx    = ${withoutBlock}.IndexOf($acctMarker)
$acctFound = $acctIdx
Write-Host ('accountingTab found at index {0}' -f $acctFound)

$insertPoint = ${withoutBlock}.LastIndexOf(${nl}, (${acctIdx} - 2)) + ${nl}.Length
$previewText = ${withoutBlock}.Substring(${insertPoint}, 50)
Write-Host ('Inserting before index {0} preview {1}' -f $insertPoint, $previewText)

# Trim the block: remove trailing whitespace/empty lines from block before reinserting
$trimmedBlock = ${block}.TrimEnd() + ${nl} + ${nl}

# 4. Build new content
$newContent = ${withoutBlock}.Substring(0, ${insertPoint}) + $trimmedBlock + ${withoutBlock}.Substring(${insertPoint})

# 5. Write back using UTF8 without BOM
$enc = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($f, $newContent, $enc)
$finalLines = ${newContent}.Split(${nl}).Count
Write-Host ('Done. File written. Lines: {0}' -f $finalLines)
