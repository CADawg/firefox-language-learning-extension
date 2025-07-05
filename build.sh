#!/bin/bash

# Firefox Extension Build Script
# This script creates a zip file ready for Firefox extension distribution

EXTENSION_NAME="language-learning-assistant"
BUILD_DIR="build"
ZIP_FILE="${EXTENSION_NAME}-v1.0.0.xpi"

echo "Building Firefox extension..."

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

# Remove old zip file if it exists
if [ -f "$ZIP_FILE" ]; then
    rm "$ZIP_FILE"
    echo "Removed old zip file: $ZIP_FILE"
fi

# Copy extension files to build directory
echo "Copying extension files..."
cp manifest.json "$BUILD_DIR/"
cp popup.html "$BUILD_DIR/"
cp popup.js "$BUILD_DIR/"
cp background.js "$BUILD_DIR/"
cp content.js "$BUILD_DIR/"
cp content.css "$BUILD_DIR/"
cp deepl-service.js "$BUILD_DIR/"

# Create icons directory in build folder
mkdir -p "$BUILD_DIR/icons"

# Create placeholder icons if they don't exist
if [ ! -f "icons/icon-16.png" ]; then
    echo "Creating placeholder icons..."
    
    # Create simple placeholder icons using ImageMagick (if available) or base64
    if command -v convert &> /dev/null; then
        convert -size 16x16 xc:blue "$BUILD_DIR/icons/icon-16.png" 2>/dev/null
        convert -size 32x32 xc:blue "$BUILD_DIR/icons/icon-32.png" 2>/dev/null
        convert -size 48x48 xc:blue "$BUILD_DIR/icons/icon-48.png" 2>/dev/null
        convert -size 128x128 xc:blue "$BUILD_DIR/icons/icon-128.png" 2>/dev/null
        echo "Created placeholder icons with ImageMagick"
    else
        # Create minimal PNG placeholders
        echo "Warning: ImageMagick not found. You'll need to add your own icon files."
        echo "Required icons: 16x16, 32x32, 48x48, 128x128 PNG files"
        
        # Create empty placeholder files
        touch "$BUILD_DIR/icons/icon-16.png"
        touch "$BUILD_DIR/icons/icon-32.png"
        touch "$BUILD_DIR/icons/icon-48.png"
        touch "$BUILD_DIR/icons/icon-128.png"
    fi
else
    # Copy existing icons
    cp -r icons/* "$BUILD_DIR/icons/"
    echo "Copied existing icons"
fi

# Create zip file
echo "Creating zip file..."
cd "$BUILD_DIR"
zip -r "../$ZIP_FILE" ./*
cd ..

# Clean up build directory
rm -rf "$BUILD_DIR"

echo "✅ Extension built successfully!"
echo "📦 File: $ZIP_FILE"
echo "📁 Size: $(du -h "$ZIP_FILE" | cut -f1)"
echo "🆔 Extension ID: language-learning@conorhow.land"
echo ""
echo "To install permanently in Firefox:"
echo "1. Open Firefox and go to about:config"
echo "2. Set 'xpinstall.signatures.required' to false"
echo "3. Go to about:addons"
echo "4. Click the gear icon → 'Install Add-on From File'"
echo "5. Select the .xpi file"
echo ""
echo "Or for development:"
echo "1. Go to about:debugging#/runtime/this-firefox"
echo "2. Click 'Load Temporary Add-on'"
echo "3. Select the .xpi file"