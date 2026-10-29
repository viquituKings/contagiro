const fs = require('fs');
const path = require('path');
const utils = require('@expo/image-utils');

async function main() {
  const rootIconPath = path.resolve('icon.png');
  if (!fs.existsSync(rootIconPath)) {
    throw new Error('icon.png not found at project root');
  }

  const assetsImagesDir = path.resolve('assets/images');
  if (!fs.existsSync(assetsImagesDir)) {
    fs.mkdirSync(assetsImagesDir, { recursive: true });
  }

  const BRAND_BG = '#101D2E';

  console.log('1. Generating universal 1024x1024 app icon (assets/images/icon.png)...');
  // 1024x1024 without alpha channel, flattened over #101D2E for App Store & iOS compliance
  const icon1024 = await utils.generateImageAsync(
    { projectRoot: '.' },
    {
      src: rootIconPath,
      width: 1024,
      height: 1024,
      resizeMode: 'contain',
      backgroundColor: BRAND_BG,
      removeTransparency: true,
    }
  );
  fs.writeFileSync(path.join(assetsImagesDir, 'icon.png'), icon1024.source);
  console.log('   -> assets/images/icon.png created.');

  console.log('2. Generating Android adaptive icon foreground (assets/images/android-icon-foreground.png)...');
  // Scaled to 850px on 1024x1024 canvas so it fits inside the Android 66%-72% safe zone
  const innerFg = await utils.generateImageAsync(
    { projectRoot: '.' },
    {
      src: rootIconPath,
      width: 850,
      height: 850,
      resizeMode: 'contain',
    }
  );
  const fgBg = await utils.generateImageBackgroundAsync({
    width: 1024,
    height: 1024,
    backgroundColor: 'transparent',
    resizeMode: 'contain',
  });
  const compFg = await utils.compositeImagesAsync({
    background: fgBg,
    foreground: innerFg.source,
    x: Math.round((1024 - 850) / 2),
    y: Math.round((1024 - 850) / 2),
  });
  fs.writeFileSync(path.join(assetsImagesDir, 'android-icon-foreground.png'), compFg);
  console.log('   -> assets/images/android-icon-foreground.png created.');

  console.log('3. Generating favicon (assets/images/favicon.png)...');
  const favicon = await utils.generateImageAsync(
    { projectRoot: '.' },
    {
      src: rootIconPath,
      width: 48,
      height: 48,
      resizeMode: 'contain',
      backgroundColor: BRAND_BG,
      removeTransparency: true,
    }
  );
  fs.writeFileSync(path.join(assetsImagesDir, 'favicon.png'), favicon.source);
  console.log('   -> assets/images/favicon.png created.');

  console.log('4. Generating splash icon (assets/images/splash-icon.png)...');
  const splash = await utils.generateImageAsync(
    { projectRoot: '.' },
    {
      src: rootIconPath,
      width: 512,
      height: 512,
      resizeMode: 'contain',
    }
  );
  fs.writeFileSync(path.join(assetsImagesDir, 'splash-icon.png'), splash.source);
  console.log('   -> assets/images/splash-icon.png created.');

  console.log('All icons generated successfully!');
}

main().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
