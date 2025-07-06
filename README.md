# Language Learning Assistant

A Firefox extension that helps you learn languages while browsing the web, similar to the discontinued Toucan extension. Uses DeepL's powerful translation API with intelligent caching to minimize API usage.

## Features

- 🌐 **Smart word replacement**: Replaces words on web pages with translations in your target language
- 🎯 **Intelligent caching**: Saves API credits by caching translations locally
- 📚 **Vocabulary tracking**: Tracks your learning progress and discovered words
- 🎨 **Beautiful tooltips**: Hover over translated words to see the original
- ⚙️ **Customizable settings**: Adjust difficulty, replacement percentage, and target language
- 🚀 **Fast and efficient**: Minimal performance impact on browsing

## Supported Languages

French (default), Spanish, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese, Dutch, Polish

## Installation

### Method 1: Signed Version (Recommended)

1. Download the latest signed `.xpi` file from the `signed-releases/` folder
2. Open Firefox and go to `about:addons`
3. Click the gear icon (⚙️) and select "Install Add-on From File"
4. Select the downloaded signed `.xpi` file
5. The extension will be permanently installed

### Method 2: Unsigned Version (Developer Firefox Required)

1. Download the latest `language-learning-assistant-v1.0.0.xpi` file from the root directory
2. **Important**: This method requires Firefox Developer Edition, as the `about:config` toggle for `xpinstall.signatures.required` doesn't work in regular Firefox
3. Open Firefox Developer Edition and navigate to `about:config`
4. Search for `xpinstall.signatures.required` and set it to `false`
5. Go to `about:addons`
6. Click the gear icon (⚙️) and select "Install Add-on From File"
7. Select the downloaded `.xpi` file
8. The extension will be permanently installed

### Method 3: Development Installation

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `.xpi` file or the `manifest.json` file from the extracted folder
4. Note: This method requires reinstalling after browser restart

## Setup

1. **Get a DeepL API key**:
   - Go to [DeepL Pro API](https://www.deepl.com/pro-api)
   - Sign up for a free account (500,000 characters/month free)
   - Copy your API key

2. **Configure the extension**:
   - Click the extension icon in Firefox toolbar
   - Enter your DeepL API key
   - Select your target language (French is default)
   - Adjust difficulty level and replacement percentage
   - Click "Enable Learning"

## Usage

- **Browse normally**: The extension will automatically replace words with translations
- **Hover for original**: Hover over highlighted words to see the original text
- **Click to learn**: Click translated words to mark them as "learned"
- **Adjust settings**: Use the popup to customize your learning experience

## Extension Details

- **ID**: `language-learning@conorhow.land`
- **Version**: 1.0.0
- **Minimum Firefox**: 57.0
- **Permissions**: Active tab, storage, DeepL API access

## Privacy

- Your API key is stored locally in your browser
- Translation cache is stored locally for efficiency
- No data is sent to third parties except DeepL for translations
- Vocabulary data stays on your device

## Building from Source

```bash
# Clone or download the source code
chmod +x build.sh
./build.sh
```

This will create `language-learning-assistant-v1.0.0.xpi` ready for installation.

## Troubleshooting

- **403 Forbidden**: Check your DeepL API key is valid
- **429 Rate Limit**: The extension automatically rate-limits to prevent this
- **No words highlighted**: Check if learning is enabled and try adjusting the replacement percentage
- **Tooltip positioning**: Tooltips automatically adjust based on viewport space

## Credits

Inspired by the original Toucan extension. Built as a modern, Firefox-compatible alternative using DeepL translations.
