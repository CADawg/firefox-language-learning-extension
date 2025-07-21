#!/bin/bash

# Firefox Extension Build Script
# This script creates a zip file ready for Firefox extension distribution

EXTENSION_NAME="language-learning-assistant"
BUILD_DIR="build"
OUTPUT_DIR="builds/unsigned"

# Parse command line arguments
BUMP_TYPE="patch"
DEV_MODE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --major)
            BUMP_TYPE="major"
            shift
            ;;
        --minor)
            BUMP_TYPE="minor"
            shift
            ;;
        --patch)
            BUMP_TYPE="patch"
            shift
            ;;
        --none)
            BUMP_TYPE="none"
            shift
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --prod)
            DEV_MODE=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--major|--minor|--patch|--none] [--dev|--prod]"
            exit 1
            ;;
    esac
done

# Function to increment version
increment_version() {
    local version=$1
    local type=$2
    
    IFS='.' read -r major minor patch <<< "$version"
    
    case $type in
        major)
            ((major++))
            minor=0
            patch=0
            ;;
        minor)
            ((minor++))
            patch=0
            ;;
        patch)
            ((patch++))
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Get current version from manifest.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)

if [ "$BUMP_TYPE" = "none" ]; then
    NEW_VERSION="$CURRENT_VERSION"
    ZIP_FILE="${EXTENSION_NAME}-v${NEW_VERSION}.xpi"
    echo "Building Firefox extension..."
    echo "🔢 Version: $CURRENT_VERSION (no version bump)"
else
    NEW_VERSION=$(increment_version "$CURRENT_VERSION" "$BUMP_TYPE")
    
    # Update manifest.json with new version
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" manifest.json
    
    ZIP_FILE="${EXTENSION_NAME}-v${NEW_VERSION}.xpi"
    echo "Building Firefox extension..."
    echo "🔢 Version: $CURRENT_VERSION → $NEW_VERSION ($BUMP_TYPE)"
fi
echo "🌍 Environment: $(if [ "$DEV_MODE" = true ]; then echo "Development (localhost:8090)"; else echo "Production (fluent-tab.dbuidl.com)"; fi)"

# Create build and output directories if they don't exist
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR"

# Remove old zip file if it exists
if [ -f "$OUTPUT_DIR/$ZIP_FILE" ]; then
    rm "$OUTPUT_DIR/$ZIP_FILE"
    echo "Removed old zip file: $OUTPUT_DIR/$ZIP_FILE"
fi

# Copy and modify manifest.json based on environment
echo "Configuring manifest for environment..."
if [ "$DEV_MODE" = true ]; then
    # Dev build: keep localhost permission
    cp manifest.json "$BUILD_DIR/"
else
    # Prod build: remove localhost permission using sed
    sed '/http:\/\/localhost:8090\/\*/d' manifest.json > "$BUILD_DIR/manifest.json"
fi
cp popup.html "$BUILD_DIR/"
cp popup.js "$BUILD_DIR/"
cp background.js "$BUILD_DIR/"
cp english-dictionary.js "$BUILD_DIR/"
cp content.js "$BUILD_DIR/"
cp content.css "$BUILD_DIR/"
cp popup.css "$BUILD_DIR/"

# Copy server-api.js and inject DEV_MODE flag
echo "Configuring server API for environment..."
if [ "$DEV_MODE" = true ]; then
    # Inject DEV_MODE = true at the top of server-api.js
    echo "const DEV_MODE = true;" > "$BUILD_DIR/server-api.js"
    cat server-api.js >> "$BUILD_DIR/server-api.js"
else
    # Inject DEV_MODE = false at the top of server-api.js  
    echo "const DEV_MODE = false;" > "$BUILD_DIR/server-api.js"
    cat server-api.js >> "$BUILD_DIR/server-api.js"
fi

# Create icons directory in build folder
mkdir -p "$BUILD_DIR/icons"

# Generate icons from extensionicon.png
if [ -f "extensionicon.png" ]; then
    echo "Generating icons from extensionicon.png..."
    
    if command -v convert &> /dev/null; then
        # Use ImageMagick to resize the main icon to different sizes
        convert "extensionicon.png" -resize 16x16 "$BUILD_DIR/icons/icon-16.png" 2>/dev/null
        convert "extensionicon.png" -resize 32x32 "$BUILD_DIR/icons/icon-32.png" 2>/dev/null
        convert "extensionicon.png" -resize 48x48 "$BUILD_DIR/icons/icon-48.png" 2>/dev/null
        convert "extensionicon.png" -resize 128x128 "$BUILD_DIR/icons/icon-128.png" 2>/dev/null
        echo "✅ Generated all icon sizes from extensionicon.png"
    else
        echo "⚠️  Warning: ImageMagick not found. Installing ImageMagick is recommended for proper icon generation."
        echo "   Ubuntu/Debian: sudo apt install imagemagick"
        echo "   Fedora/RHEL: sudo dnf install ImageMagick"
        echo "   macOS: brew install imagemagick"
        echo ""
        echo "Copying extensionicon.png as-is for all sizes (may not be optimal)..."
        
        # Fallback: copy the main icon for all sizes
        cp "extensionicon.png" "$BUILD_DIR/icons/icon-16.png"
        cp "extensionicon.png" "$BUILD_DIR/icons/icon-32.png"
        cp "extensionicon.png" "$BUILD_DIR/icons/icon-48.png"
        cp "extensionicon.png" "$BUILD_DIR/icons/icon-128.png"
    fi
elif [ -d "icons" ] && [ -f "icons/icon-16.png" ]; then
    # Fallback: Copy existing icons directory if it exists
    cp -r icons/* "$BUILD_DIR/icons/"
    echo "Copied existing icons from icons/ directory"
else
    echo "❌ Error: extensionicon.png not found and no icons directory available"
    echo "   Please ensure extensionicon.png exists in the project root"
    cd ..
    rm -rf "$BUILD_DIR"
    exit 1
fi

# Create zip file
echo "Creating zip file..."
cd "$BUILD_DIR"

# Check if zip command is available
if command -v zip &> /dev/null; then
    zip -r "../$OUTPUT_DIR/$ZIP_FILE" ./*
elif command -v 7z &> /dev/null; then
    7z a "../$OUTPUT_DIR/$ZIP_FILE" ./*
else
    echo "Error: Neither 'zip' nor '7z' command found. Please install one of them."
    echo "Ubuntu/Debian: sudo apt install zip"
    echo "Fedora/RHEL: sudo dnf install zip"
    echo "macOS: brew install zip"
    cd ..
    rm -rf "$BUILD_DIR"
    exit 1
fi

cd ..

# Clean up build directory
rm -rf "$BUILD_DIR"

echo "✅ Extension built successfully!"
echo "📦 File: $OUTPUT_DIR/$ZIP_FILE"
echo "📁 Size: $(du -h "$OUTPUT_DIR/$ZIP_FILE" | cut -f1)"
echo "🆔 Extension ID: firefox-language-learning@cadawg.com"
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