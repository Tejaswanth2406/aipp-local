# scripts/resize-icons.ps1
Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\tejas\.gemini\antigravity-ide\brain\3669a315-7590-4433-ad9c-ebc946054702\black_swan_icon_1792146279375.jpg'
$outDir = 'c:\Users\tejas\OneDrive\Desktop\BLACK SWAN\icons'
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
$extIconsDir = 'c:\Users\tejas\OneDrive\Desktop\BLACK SWAN\aipp-local\icons'

$srcImg = [System.Drawing.Image]::FromFile($srcPath)

$sizes = @(16, 32, 48, 64, 128, 256, 512)

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($srcImg, 0, 0, $s, $s)
    $g.Dispose()

    $destFile = Join-Path $outDir "black-swan-$s.png"
    $bmp.Save($destFile, [System.Drawing.Imaging.ImageFormat]::Png)

    # Update extension icons for 16, 48, 128
    if ($s -eq 16 -or $s -eq 48 -or $s -eq 128) {
        $extDest = Join-Path $extIconsDir "icon-$s.png"
        $bmp.Save($extDest, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    $bmp.Dispose()
    Write-Host "Generated: $destFile"
}

$srcImg.Dispose()
Write-Host "All icons resized successfully!"
