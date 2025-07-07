class LanguageLearningPopup {
    constructor() {
        this.settings = {
            languageLearningEnabled: false,
            targetLanguage: 'fr',
            difficulty: 'beginner',
            replacementPercentage: 10
        };
        
        this.init();
    }

    async init() {
        // Check if background script is running
        await this.checkBackgroundScript();
        
        await this.loadSettings();
        this.setupEventListeners();
        this.setupProgressListener();
        this.updateUI();
        this.loadStats();
        this.checkCurrentTabProgress();
    }
    
    async checkBackgroundScript() {
        try {
            const response = await browser.runtime.sendMessage({ action: 'ping' });
            if (!response || !response.success) {
                this.showStatus('Extension initialization issue. Please reload.', 'error');
            }
        } catch (error) {
            console.error('Background script not responding:', error);
            this.showStatus('Background script not running. Please reload the extension.', 'error');
        }
    }

    async loadSettings() {
        const stored = await browser.storage.local.get([
            'languageLearningEnabled',
            'targetLanguage',
            'difficulty',
            'replacementPercentage',
            'deeplApiKey'
        ]);
        
        this.settings = {
            languageLearningEnabled: stored.languageLearningEnabled || false,
            targetLanguage: stored.targetLanguage || 'fr',
            difficulty: stored.difficulty || 'beginner',
            replacementPercentage: stored.replacementPercentage || 10
        };
        
        if (stored.deeplApiKey) {
            document.getElementById('apiKey').value = stored.deeplApiKey;
            // Give background script time to initialize before validating
            setTimeout(() => {
                this.validateApiKey(stored.deeplApiKey);
            }, 500);
        }
    }

    setupEventListeners() {
        document.getElementById('toggleBtn').addEventListener('click', () => {
            this.toggleLearning();
        });

        document.getElementById('apiKey').addEventListener('input', (e) => {
            this.handleApiKeyInput(e.target.value);
        });

        document.getElementById('targetLanguage').addEventListener('change', (e) => {
            this.updateSetting('targetLanguage', e.target.value);
        });

        document.getElementById('difficulty').addEventListener('change', (e) => {
            this.updateSetting('difficulty', e.target.value);
        });

        document.getElementById('replacementPercentage').addEventListener('input', (e) => {
            this.updateSetting('replacementPercentage', parseInt(e.target.value));
            document.getElementById('percentageValue').textContent = `${e.target.value}%`;
        });

        document.getElementById('clearCache').addEventListener('click', () => {
            this.clearCache();
        });

        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });
        
        document.getElementById('importData').addEventListener('click', () => {
            this.importData();
        });
        
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchTranslations(e.target.value);
        });
    }

    async toggleLearning() {
        const apiKey = document.getElementById('apiKey').value;
        if (!apiKey && !this.settings.languageLearningEnabled) {
            this.showStatus('Please enter your DeepL API key first', 'error');
            return;
        }

        this.settings.languageLearningEnabled = !this.settings.languageLearningEnabled;
        await this.saveSettings();
        
        // Update background script settings
        try {
            await browser.runtime.sendMessage({
                action: 'updateSettings',
                settings: { languageLearningEnabled: this.settings.languageLearningEnabled }
            });
        } catch (error) {
            console.error('Error updating background settings:', error);
        }
        
        // Try to notify content script, but don't fail if it's not available
        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            
            // Check if this is a valid tab for content scripts
            if (tab && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('moz-extension:')) {
                await browser.tabs.sendMessage(tab.id, { 
                    action: 'toggleLearning'
                });
            }
        } catch (error) {
            // Content script not available on this tab - that's okay
            console.log('Content script not available on current tab (this is normal for some pages)');
        }
        
        this.updateUI();
        this.showStatus(
            this.settings.languageLearningEnabled ? 
            'Learning enabled! Visit a webpage to start learning.' : 'Learning disabled', 
            'success'
        );
    }

    async handleApiKeyInput(apiKey) {
        if (apiKey.length > 10) {
            try {
                console.log('Setting API key...');
                const response = await browser.runtime.sendMessage({
                    action: 'setApiKey',
                    apiKey: apiKey
                });
                
                console.log('Set API key response:', response);
                
                if (response && response.success) {
                    this.updateApiKeyStatus('API key set successfully', true);
                    // Save API key to storage for persistence  
                    await browser.storage.local.set({deeplApiKey: apiKey});
                } else {
                    // Log the full response for debugging
                    console.log('Full response:', response);
                    
                    if (response === undefined) {
                        this.updateApiKeyStatus('No response from background script', false);
                    } else if (response.success === false) {
                        const errorMsg = response.error || 'Background script returned failure';
                        console.error('Failed to set API key:', errorMsg);
                        this.updateApiKeyStatus(`Error: ${errorMsg}`, false);
                    } else {
                        // Response exists but doesn't have expected format
                        this.updateApiKeyStatus('Unexpected response format', false);
                        console.warn('Unexpected response format:', response);
                    }
                }
            } catch (error) {
                console.error('Error setting API key:', error);
                if (error.message.includes('Receiving end does not exist')) {
                    this.updateApiKeyStatus('Extension error: Please reload the extension', false);
                    this.showStatus('Background script not running. Please reload the extension or restart Firefox.', 'error');
                } else {
                    this.updateApiKeyStatus(`Error: ${error.message}`, false);
                }
            }
        } else {
            this.updateApiKeyStatus('API key required', false);
        }
    }

    async validateApiKey(apiKey) {
        try {
            // Test the API key by trying to get supported languages
            const response = await browser.runtime.sendMessage({
                action: 'validateApiKey',
                apiKey: apiKey
            });
            
            if (response && response.success) {
                this.updateApiKeyStatus('Valid API key', true);
            } else {
                this.updateApiKeyStatus('Invalid API key', false);
            }
        } catch (error) {
            console.error('Error validating API key:', error);
            if (error.message.includes('Receiving end does not exist')) {
                this.updateApiKeyStatus('Extension error: Please reload', false);
            } else {
                this.updateApiKeyStatus('Invalid API key', false);
            }
        }
    }

    updateApiKeyStatus(message, isValid) {
        const statusEl = document.getElementById('apiKeyStatus');
        statusEl.textContent = message;
        statusEl.className = `api-key-status ${isValid ? 'valid' : 'invalid'}`;
    }

    async updateSetting(key, value) {
        this.settings[key] = value;
        await this.saveSettings();
        
        try {
            // Send to background script
            await browser.runtime.sendMessage({
                action: 'updateSettings',
                settings: { [key]: value }
            });
            
            // Also send to content script for immediate update
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            await browser.tabs.sendMessage(tab.id, { 
                action: 'updateSettings', 
                settings: { [key]: value }
            });
            
            this.showStatus('Settings updated', 'success');
        } catch (error) {
            console.error('Error updating settings:', error);
        }
    }

    async saveSettings() {
        await browser.storage.local.set(this.settings);
    }

    updateUI() {
        const toggleBtn = document.getElementById('toggleBtn');
        const isEnabled = this.settings.languageLearningEnabled;
        
        toggleBtn.textContent = isEnabled ? 'Disable Learning' : 'Enable Learning';
        toggleBtn.className = `toggle-button ${isEnabled ? 'enabled' : 'disabled'}`;
        
        document.getElementById('targetLanguage').value = this.settings.targetLanguage;
        document.getElementById('difficulty').value = this.settings.difficulty;
        document.getElementById('replacementPercentage').value = this.settings.replacementPercentage;
        document.getElementById('percentageValue').textContent = `${this.settings.replacementPercentage}%`;
    }

    async loadStats() {
        try {
            // Get stats from background script
            const stats = await browser.runtime.sendMessage({ action: 'getStats' });
            
            if (stats) {
                this.updateStats(stats);
            }
        } catch (error) {
            // Fallback to storage if background script fails
            const stored = await browser.storage.local.get(['vocabulary', 'learnedWords']);
            
            const vocabularySize = stored.vocabulary ? Object.keys(stored.vocabulary).length : 0;
            const learnedWords = stored.learnedWords ? stored.learnedWords.length : 0;
            
            this.updateStats({
                vocabularySize,
                learnedWords
            });
        }
    }

    updateStats(stats) {
        document.getElementById('vocabularySize').textContent = stats.vocabularySize || 0;
        document.getElementById('wordsLearned').textContent = stats.learnedWords || 0;
    }

    async clearCache() {
        if (confirm('Clear translation cache and vocabulary data?')) {
            try {
                await browser.runtime.sendMessage({ action: 'clearCache' });
                
                this.updateStats({ vocabularySize: 0, learnedWords: 0 });
                this.showStatus('Cache cleared successfully', 'success');
            } catch (error) {
                this.showStatus('Error clearing cache', 'error');
            }
        }
    }

    async exportData() {
        try {
            const data = await browser.storage.local.get([
                'vocabulary', 
                'learnedWords', 
                'translationCache',
                'incorrectTranslations',
                'languageLearningEnabled',
                'targetLanguage',
                'difficulty',
                'replacementPercentage'
            ]);
            
            const exportData = {
                formatVersion: '2.0', // Updated format version
                exportDate: new Date().toISOString(),
                extensionVersion: '1.0.4', // From manifest
                
                // User data
                vocabulary: data.vocabulary || {},
                learnedWords: data.learnedWords || [],
                translationCache: data.translationCache || {},
                incorrectTranslations: data.incorrectTranslations || [],
                
                // Settings
                settings: {
                    languageLearningEnabled: data.languageLearningEnabled || false,
                    targetLanguage: data.targetLanguage || 'fr',
                    difficulty: data.difficulty || 'beginner',
                    replacementPercentage: data.replacementPercentage || 10
                },
                
                // Metadata
                stats: {
                    vocabularySize: Object.keys(data.vocabulary || {}).length,
                    learnedWordsCount: (data.learnedWords || []).length,
                    cacheSize: Object.keys(data.translationCache || {}).length,
                    incorrectCount: (data.incorrectTranslations || []).length
                }
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `language-learning-export-v${exportData.formatVersion}-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showStatus('Data exported successfully', 'success');
        } catch (error) {
            this.showStatus('Error exporting data', 'error');
        }
    }
    
    async importData() {
        try {
            // Create file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const importData = JSON.parse(text);
                    
                    // Validate format
                    if (!this.validateImportData(importData)) {
                        this.showStatus('Invalid import file format', 'error');
                        return;
                    }
                    
                    // Show confirmation with import details
                    const confirmed = confirm(
                        `Import language learning data?\n\n` +
                        `Format Version: ${importData.formatVersion || 'Unknown'}\n` +
                        `Export Date: ${importData.exportDate || 'Unknown'}\n` +
                        `Vocabulary: ${Object.keys(importData.vocabulary || {}).length} words\n` +
                        `Learned Words: ${(importData.learnedWords || []).length} words\n` +
                        `Cache Entries: ${Object.keys(importData.translationCache || {}).length} entries\n\n` +
                        `This will merge with your existing data.`
                    );
                    
                    if (!confirmed) return;
                    
                    await this.performImport(importData);
                    
                } catch (error) {
                    console.error('Import error:', error);
                    this.showStatus('Error reading import file', 'error');
                }
            };
            
            input.click();
        } catch (error) {
            this.showStatus('Error importing data', 'error');
        }
    }
    
    validateImportData(data) {
        // Check if it's a valid export format
        if (typeof data !== 'object') return false;
        
        // Support both old (v1.0) and new (v2.0) formats
        const hasV1Format = data.version === '1.0' && data.vocabulary;
        const hasV2Format = data.formatVersion && data.vocabulary;
        
        return hasV1Format || hasV2Format;
    }
    
    async performImport(importData) {
        try {
            // Get current data
            const currentData = await browser.storage.local.get([
                'vocabulary',
                'learnedWords', 
                'translationCache',
                'incorrectTranslations'
            ]);
            
            // Merge vocabulary (newer entries override older ones)
            const mergedVocabulary = { ...currentData.vocabulary, ...importData.vocabulary };
            
            // Merge learned words (union of both sets)
            const currentLearned = new Set(currentData.learnedWords || []);
            const importLearned = new Set(importData.learnedWords || []);
            const mergedLearned = [...new Set([...currentLearned, ...importLearned])];
            
            // Merge translation cache (newer entries override)
            const mergedCache = { ...currentData.translationCache, ...importData.translationCache };
            
            // Merge incorrect translations
            const mergedIncorrect = [...(currentData.incorrectTranslations || []), ...(importData.incorrectTranslations || [])];
            
            // Save merged data
            await browser.storage.local.set({
                vocabulary: mergedVocabulary,
                learnedWords: mergedLearned,
                translationCache: mergedCache,
                incorrectTranslations: mergedIncorrect
            });
            
            // If import has settings, optionally import them
            if (importData.settings && importData.formatVersion === '2.0') {
                const importSettings = confirm(
                    'Import settings as well?\n\n' +
                    `Target Language: ${importData.settings.targetLanguage}\n` +
                    `Difficulty: ${importData.settings.difficulty}\n` +
                    `Replacement %: ${importData.settings.replacementPercentage}%`
                );
                
                if (importSettings) {
                    await browser.storage.local.set(importData.settings);
                    // Update local settings and UI
                    Object.assign(this.settings, importData.settings);
                    this.updateUI();
                }
            }
            
            // Update stats and UI
            this.loadStats();
            
            const stats = {
                vocabulary: Object.keys(mergedVocabulary).length,
                learned: mergedLearned.length,
                cache: Object.keys(mergedCache).length
            };
            
            this.showStatus(
                `Import successful! ` +
                `Vocabulary: ${stats.vocabulary}, ` +
                `Learned: ${stats.learned}, ` +
                `Cache: ${stats.cache}`,
                'success'
            );
            
        } catch (error) {
            console.error('Import error:', error);
            this.showStatus('Error importing data', 'error');
        }
    }

    setupProgressListener() {
        // Listen for progress updates from background script
        browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
            if (request.action === 'progressUpdate') {
                // Only show progress from the currently active tab
                const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
                if (request.tabId === activeTab.id) {
                    this.updateProgress(request.message, request.percentage);
                }
                return true;
            }
            return false;
        });
    }

    updateProgress(message, percentage) {
        const progressSection = document.getElementById('progressSection');
        const progressStatus = document.getElementById('progressStatus');
        const progressBarFill = document.getElementById('progressBarFill');
        
        // Show progress section when learning is enabled and there's activity
        if (this.settings.languageLearningEnabled) {
            progressSection.style.display = 'block';
            progressStatus.textContent = message;
            progressBarFill.style.width = `${percentage}%`;
            
            // Hide progress section after completion
            if (message === 'Ready' || percentage >= 100) {
                setTimeout(() => {
                    if (progressStatus.textContent === 'Ready') {
                        progressSection.style.display = 'none';
                    }
                }, 2000);
            }
        } else {
            progressSection.style.display = 'none';
        }
    }

    checkCurrentTabProgress() {
        // Reset progress display when popup opens to show current tab state
        const progressSection = document.getElementById('progressSection');
        if (!this.settings.languageLearningEnabled) {
            progressSection.style.display = 'none';
        } else {
            // If learning is enabled but no recent progress updates, assume ready state
            setTimeout(() => {
                const progressStatus = document.getElementById('progressStatus');
                if (progressStatus.textContent === 'Ready') {
                    progressSection.style.display = 'none';
                }
            }, 100);
        }
    }

    async searchTranslations(query) {
        const resultsContainer = document.getElementById('searchResults');
        
        if (!query || query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }
        
        try {
            // Get vocabulary from background
            const stats = await browser.runtime.sendMessage({ action: 'getStats' });
            const stored = await browser.storage.local.get(['vocabulary']);
            
            if (!stored.vocabulary) {
                resultsContainer.innerHTML = '<div class="search-result-item">No translations found</div>';
                return;
            }
            
            const vocabulary = stored.vocabulary;
            const matches = Object.entries(vocabulary)
                .filter(([key, data]) => 
                    data.original.toLowerCase().includes(query.toLowerCase()) ||
                    data.translation.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 5); // Limit to 5 results
            
            if (matches.length === 0) {
                resultsContainer.innerHTML = '<div class="search-result-item">No matches found</div>';
                return;
            }
            
            resultsContainer.innerHTML = matches.map(([key, data]) => `
                <div class="search-result-item">
                    <div class="search-result-word">${data.original}</div>
                    <div class="search-result-translation">${data.translation}</div>
                    <div class="search-result-actions">
                        <button class="search-result-btn edit-btn" data-word="${data.original}" data-translation="${data.translation}">Edit</button>
                        <button class="search-result-btn remove-btn" data-word="${data.original}">Remove</button>
                    </div>
                </div>
            `).join('');
            
            // Add event listeners to buttons
            resultsContainer.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.editTranslation(btn.dataset.word, btn.dataset.translation);
                });
            });
            
            resultsContainer.querySelectorAll('.remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.removeTranslation(btn.dataset.word);
                });
            });
            
        } catch (error) {
            console.error('Error searching translations:', error);
            resultsContainer.innerHTML = '<div class="search-result-item">Error searching translations</div>';
        }
    }
    
    editTranslation(word, currentTranslation) {
        const newTranslation = prompt(`Edit translation for "${word}":`, currentTranslation);
        if (newTranslation && newTranslation !== currentTranslation) {
            this.updateTranslation(word, newTranslation);
        }
    }
    
    async updateTranslation(word, newTranslation) {
        try {
            // Update the vocabulary storage
            const stored = await browser.storage.local.get(['vocabulary']);
            const vocabulary = stored.vocabulary || {};
            const key = word.toLowerCase();
            
            if (vocabulary[key]) {
                vocabulary[key].translation = newTranslation;
                await browser.storage.local.set({ vocabulary });
                
                // Also update the translation cache
                const cacheKey = `${word.toLowerCase().trim()}|auto|${this.settings.targetLanguage}`;
                const cacheStored = await browser.storage.local.get(['translationCache']);
                const cache = cacheStored.translationCache || {};
                
                if (cache[cacheKey]) {
                    cache[cacheKey].text = newTranslation;
                    await browser.storage.local.set({ translationCache: cache });
                }
                
                this.showStatus('Translation updated successfully', 'success');
                
                // Refresh search results
                const searchQuery = document.getElementById('searchInput').value;
                if (searchQuery) {
                    this.searchTranslations(searchQuery);
                }
            }
        } catch (error) {
            console.error('Error updating translation:', error);
            this.showStatus('Error updating translation', 'error');
        }
    }
    
    async removeTranslation(word) {
        if (!confirm(`Remove translation for "${word}"?`)) return;
        
        try {
            // Remove from vocabulary
            const stored = await browser.storage.local.get(['vocabulary']);
            const vocabulary = stored.vocabulary || {};
            const key = word.toLowerCase();
            
            delete vocabulary[key];
            await browser.storage.local.set({ vocabulary });
            
            // Remove from translation cache
            const cacheKey = `${word.toLowerCase().trim()}|auto|${this.settings.targetLanguage}`;
            const cacheStored = await browser.storage.local.get(['translationCache']);
            const cache = cacheStored.translationCache || {};
            
            delete cache[cacheKey];
            await browser.storage.local.set({ translationCache: cache });
            
            this.showStatus('Translation removed successfully', 'success');
            
            // Refresh search results
            const searchQuery = document.getElementById('searchInput').value;
            if (searchQuery) {
                this.searchTranslations(searchQuery);
            }
            
            // Update stats
            this.loadStats();
            
        } catch (error) {
            console.error('Error removing translation:', error);
            this.showStatus('Error removing translation', 'error');
        }
    }
    
    showStatus(message, type) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = type;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LanguageLearningPopup();
});