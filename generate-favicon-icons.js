#!/usr/bin/env node

/**
 * Generate favicon icons (icon-32 and icon-192) from bar.png
 * Extracts square region for clean icon-only appearance
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const barLogoPath = path.join(__dirname, 'Logo', 'bar.png');
const logoDir = path.join(__dirname, 'Logo');

// Favicon configurations
const faviconConfigs = [
  { filename: 'icon-32.png', size: 32 },
  { filename: 'icon-192.png', size: 192 },
];

async function generateFaviconIcons() {
  try {
    console.log(`📦 Generating favicon icons from: ${barLogoPath}\n`);
    
    // Check if source logo exists
    if (!fs.existsSync(barLogoPath)) {
      throw new Error(`Logo not found at: ${barLogoPath}`);
    }
    
    // Get logo metadata for square extraction
    const metadata = await sharp(barLogoPath).metadata();
    console.log(`📐 Source dimensions: ${metadata.width}x${metadata.height}`);
    
    // Extract square region from center
    const minDim = Math.min(metadata.width, metadata.height);
    const startX = Math.floor((metadata.width - minDim) / 2);
    const startY = Math.floor((metadata.height - minDim) / 2);
    
    console.log(`✂️  Extracting square region: ${minDim}x${minDim} from (${startX}, ${startY})\n`);
    
    const squareLogo = await sharp(barLogoPath)
      .extract({
        left: startX,
        top: startY,
        width: minDim,
        height: minDim
      })
      .toBuffer();
    
    // Generate each favicon size with maximum fill for visibility
    for (const config of faviconConfigs) {
      const outputPath = path.join(logoDir, config.filename);
      
      console.log(`⚙️  Generating ${config.filename} (${config.size}x${config.size})...`);
      
      // Favicon sizes: 90% fill for maximum visibility
      const fillPercent = 0.90;
      const iconSize = Math.floor(config.size * fillPercent);
      const padding = Math.floor((config.size - iconSize) / 2);
      
      await sharp(squareLogo)
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
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Created: ${config.filename}`);
    }
    
    console.log('\n🎉 Favicon icons generated successfully!');
    console.log(`📍 Location: ${logoDir}\n`);
    
  } catch (error) {
    console.error('❌ Error generating favicon icons:', error.message);
    process.exit(1);
  }
}

// Run the generation
generateFaviconIcons();
