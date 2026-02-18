#!/usr/bin/env node

/**
 * Generate optimized favicon from TransvortexLTD.png
 * - Extract icon portion (square/circular area)
 * - Minimize padding for max visibility at 16x16 and 32x32
 * - Fill 85-90% of canvas
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const logoPath = path.join(__dirname, 'assets/images/Logo.png');
const iconsDir = path.join(__dirname, 'icons');

async function generateOptimizedFavicon() {
  try {
    console.log(`📦 Optimizing favicon from: ${logoPath}`);
    
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo not found at: ${logoPath}`);
    }
    
    // Get logo metadata to find its dimensions
    const metadata = await sharp(logoPath).metadata();
    console.log(`📐 Logo dimensions: ${metadata.width}x${metadata.height}`);
    
    // For favicon optimization:
    // - Extract center square region (icon only, no text)
    // - This assumes the logo has the icon centered
    // - We'll use the smaller dimension to get a square
    
    const minDim = Math.min(metadata.width, metadata.height);
    const startX = Math.floor((metadata.width - minDim) / 2);
    const startY = Math.floor((metadata.height - minDim) / 2);
    
    console.log(`✂️  Extracting square region: ${minDim}x${minDim} from (${startX}, ${startY})`);
    
    // Extract square region from center
    const squareLogo = await sharp(logoPath)
      .extract({
        left: startX,
        top: startY,
        width: minDim,
        height: minDim
      })
      .toBuffer();
    
    // Favicon sizes: minimal padding for visibility
    const faviconSizes = [
      { filename: 'favicon-16x16.png', size: 16, fillPercent: 0.90 },  // 90% fill = 14.4 px icon
      { filename: 'favicon-32x32.png', size: 32, fillPercent: 0.88 },  // 88% fill = 28.16 px icon
    ];
    
    for (const config of faviconSizes) {
      const iconSize = Math.floor(config.size * config.fillPercent);
      const padding = Math.floor((config.size - iconSize) / 2);
      
      const outputPath = path.join(iconsDir, config.filename);
      
      console.log(`⚙️  Generating ${config.filename} (${config.size}x${config.size}, ${config.fillPercent * 100}% fill)...`);
      
      // Resize square logo to icon size with minimal padding
      await sharp(squareLogo)
        .resize(iconSize, iconSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .extend({
          top: padding,
          bottom: config.size - iconSize - padding,  // Handle odd sizes
          left: padding,
          right: config.size - iconSize - padding,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Created: ${config.filename}`);
    }
    
    console.log('\n🎉 Optimized favicons generated successfully!');
    console.log(`📍 Location: ${iconsDir}`);
    
  } catch (error) {
    console.error('❌ Error generating optimized favicon:', error.message);
    process.exit(1);
  }
}

generateOptimizedFavicon();
