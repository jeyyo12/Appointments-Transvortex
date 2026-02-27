$f = "c:\Users\Dan\Documents\GitHub\Appointments-Transvortex\index.html"
$c = Get-Content $f -Raw

# 1. Extract Invoice Storage block
$ci  = $c.IndexOf('<!-- ===== INVOICES STORAGE SECTION')
$ls  = $c.LastIndexOf("`n", $ci) + 1
$ce  = $c.IndexOf('<div id="scannedInvoicesTab"', $ci)
$block = $c.Substring($ls, $ce - $ls)
$blockLines = $block.Split("`n").Count
Write-Host "Block extracted: $blockLines lines"

# 2. Remove block from current position (replace with nothing)
$withoutBlock = $c.Substring(0, $ls) + $c.Substring($ce)

# 3. Find insertion point: inside scannedInvoicesTab, just before its closing </div>
#    Pattern: </section>\n            </div>\n\n            <div id="accountingTab"
$acctMarker = '<div id="accountingTab"'
$acctIdx    = $withoutBlock.IndexOf($acctMarker)
$acctFound = $acctIdx
Write-Host "accountingTab found at index $acctFound"

# Walk back from accountingTab to find the </div> line before it
# That </div> closes scannedInvoicesTab - we insert block before it
$insertPoint = $withoutBlock.LastIndexOf("`n", $acctIdx - 2) + 1
$previewText = $withoutBlock.Substring($insertPoint, 50)
Write-Host "Inserting before index $insertPoint, preview: $previewText"

# Trim the block: remove trailing whitespace/empty lines from block before reinserting
$trimmedBlock = $block.TrimEnd() + "`n`n"

# 4. Build new content
$newContent = $withoutBlock.Substring(0, $insertPoint) + $trimmedBlock + $withoutBlock.Substring($insertPoint)

# 5. Write back using UTF8 without BOM
$enc = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($f, $newContent, $enc)
$finalLines = $newContent.Split("`n").Count
Write-Host "Done. File written. Lines: $finalLines"
