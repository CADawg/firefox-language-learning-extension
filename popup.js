class LanguageLearningPopup {
    constructor() {
        this.deepLService = new DeepLService();
        this.settings = {
            languageLearningEnabled: false,
            targetLanguage: 'fr',
            difficulty: 'beginner',
            replacementPercentage: 10
        };
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateUI();
        this.loadStats();
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
            this.validateApiKey(stored.deeplApiKey);
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
    }

    async toggleLearning() {
        const apiKey = document.getElementById('apiKey').value;
        if (!apiKey && !this.settings.languageLearningEnabled) {
            this.showStatus('Please enter your DeepL API key first', 'error');
            return;
        }

        this.settings.languageLearningEnabled = !this.settings.languageLearningEnabled;
        await this.saveSettings();
        
        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            await browser.tabs.sendMessage(tab.id, { 
                action: 'toggleLearning'
            });
            
            this.updateUI();
            this.showStatus(
                this.settings.languageLearningEnabled ? 
                'Learning enabled!' : 'Learning disabled', 
                'success'
            );
        } catch (error) {
            console.error('Error toggling learning:', error);
            this.showStatus('Error: Please refresh the page', 'error');
        }
    }

    async handleApiKeyInput(apiKey) {
        if (apiKey.length > 10) {
            await this.deepLService.setAPIKey(apiKey);
            this.validateApiKey(apiKey);
        } else {
            this.updateApiKeyStatus('API key required', false);
        }
    }

    async validateApiKey(apiKey) {
        try {
            await this.deepLService.getSupportedLanguages();
            this.updateApiKeyStatus('Valid API key', true);
        } catch (error) {
            this.updateApiKeyStatus('Invalid API key', false);
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
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            const stats = await browser.tabs.sendMessage(tab.id, { action: 'getStats' });
            
            if (stats) {
                this.updateStats(stats);
            }
        } catch (error) {
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
                await this.deepLService.clearCache();
                await browser.storage.local.remove(['vocabulary', 'learnedWords']);
                
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
                'translationCache'
            ]);
            
            const exportData = {
                vocabulary: data.vocabulary || {},
                learnedWords: data.learnedWords || [],
                translationCache: data.translationCache || {},
                exportDate: new Date().toISOString(),
                version: '1.0'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `language-learning-data-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showStatus('Data exported successfully', 'success');
        } catch (error) {
            this.showStatus('Error exporting data', 'error');
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