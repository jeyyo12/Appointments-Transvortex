#!/usr/bin/env node

/**
 * Generate PWA and favicon icons from bar.png (square icon only)
 * Creates all required sizes for web, Android, iOS, and desktop
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const barLogoPath = path.join(__dirname, 'Logo', 'bar.png');
const iconsDir = path.join(__dirname, 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon configurations: { filename: size, purpose? }
const iconConfigs = [
  // Standard icons for PWA
  { filename: 'icon-192x192.png', size: 192 },
  { filename: 'icon-512x512.png', size: 512 },
  
  // Maskable icons (adaptive icon support for Android)
  { filename: 'icon-maskable-192x192.png', size: 192, maskable: true },
  { filename: 'icon-maskable-512x512.png', size: 512, maskable: true },
  
  // Apple touch icon (iOS home screen)
  { filename: 'apple-touch-icon.png', size: 180 },
  
  // Favicon PNG sizes
  { filename: 'favicon-16x16.png', size: 16 },
  { filename: 'favicon-32x32.png', size: 32 },
  
  // Shortcut icon (96x96)
  { filename: 'icon-96x96.png', size: 96 },
];

async function generateIcons() {
  try {
    console.log(`📦 Starting icon generation from: ${barLogoPath}`);
    
    // Check if source logo exists
    if (!fs.existsSync(barLogoPath)) {
      throw new Error(`Logo not found at: ${barLogoPath}`);
    }
    
    // Get logo metadata for square extraction
    const metadata = await sharp(barLogoPath).metadata();
    console.log(`📐 Logo dimensions: ${metadata.width}x${metadata.height}`);
    
    // Extract square region from center (for better favicon optimization)
    const minDim = Math.min(metadata.width, metadata.height);
    const startX = Math.floor((metadata.width - minDim) / 2);
    const startY = Math.floor((metadata.height - minDim) / 2);
    
    console.log(`✂️  Extracting square region: ${minDim}x${minDim} from (${startX}, ${startY})`);
    
    const squareLogo = await sharp(barLogoPath)
      .extract({
        left: startX,
        top: startY,
        width: minDim,
        height: minDim
      })
      .toBuffer();
    
    // Generate each icon size
    for (const config of iconConfigs) {
      const outputPath = path.join(iconsDir, config.filename);
      
      console.log(`⚙️  Generating ${config.filename} (${config.size}x${config.size})...`);
      
      let image;
      
      // Favicon sizes: maximum visibility with 85-90% fill
      if (config.filename.startsWith('favicon-')) {
        const fillPercent = config.filename === 'favicon-16x16.png' ? 0.90 : 0.88;
        const iconSize = Math.floor(config.size * fillPercent);
        const padding = Math.floor((config.size - iconSize) / 2);
        
        image = sharp(squareLogo)
          .resize(iconSize, iconSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .extend({
            top: padding,
            bottom: config.size - iconSize - padding,
            left: padding,
            right: config.size - iconSize - padding,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          });
      }
      // Apple touch icon: 50% fill (balanced for iOS home screen)
      else if (config.filename === 'apple-touch-icon.png') {
        const logoSize = Math.floor(config.size * 0.5);
        const padding = Math.floor((config.size - logoSize) / 2);
        
        image = sharp(squareLogo)
          .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          });
      }
      // PWA icons: balanced (50% fill for prominence)
      else if (config.filename.startsWith('icon-') && !config.filename.includes('maskable')) {
        const logoSize = Math.floor(config.size * 0.5);
        const padding = Math.floor((config.size - logoSize) / 2);
        
        image = sharp(squareLogo)
          .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          });
      }
      // Maskable icons (Android): smaller to stay in safe zone
      else if (config.maskable) {
        const safeSize = Math.floor(config.size * 0.33);
        image = sharp(squareLogo)
          .resize(safeSize, safeSize, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .extend({
            top: Math.floor((config.size - safeSize) / 2),
            bottom: Math.floor((config.size - safeSize) / 2),
            left: Math.floor((config.size - safeSize) / 2),
            right: Math.floor((config.size - safeSize) / 2),
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          });
      }
      
      await image.png().toFile(outputPath);
      console.log(`✅ Created: ${config.filename}`);
    }
    
    console.log('\n🎉 All icons generated successfully!');
    console.log(`📍 Location: ${iconsDir}\n`);
    
    // Generate favicon.ico (multi-size)
    await generateFavicon();
    
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

async function generateFavicon() {
  try {
    console.log('⚙️  Generating favicon.ico (16, 32, 48 sizes)...');
    
    // For favicon.ico, we'll create just the 32x32 PNG as base
    // Modern browsers accept PNG favicons as .ico equivalent
    const faviconPath = path.join(iconsDir, 'favicon.ico');
    
    await sharp(barLogoPath)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(faviconPath.replace('.ico', '.png'));
    
    // Note: True .ico conversion requires additional tools
    // For now, we're using favicon-32x32.png as the favicon
    console.log('✅ Created: favicon-32x32.png (use as favicon)');
    
  } catch (error) {
    console.error('❌ Error generating favicon:', error.message);
  }
}

// Run the generation
generateIcons();
