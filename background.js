class LanguageLearningBackground {
    constructor() {
        this.deepLService = new DeepLService();
        this.vocabularyTracker = new VocabularyTracker();
        this.translationQueue = new Map(); // tabId -> processing queue
        this.activeProcessing = new Set(); // Track which tabs are actively processing
        this.rateLimiter = new BackgroundRateLimiter(50); // DeepL API limit - 50 requests per second
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupMessageListener();
        this.setupInstallHandler();
        console.log('Language Learning Background Script loaded');
    }

    setupInstallHandler() {
        browser.runtime.onInstalled.addListener(() => {
            console.log('Language Learning Extension installed');
            
            browser.storage.local.set({
                extensionData: {
                    installDate: new Date().toISOString(),
                    version: '1.0'
                },
                languageLearningEnabled: false,
                targetLanguage: 'fr',
                difficulty: 'beginner',
                replacementPercentage: 10
            });
        });
    }

    async loadSettings() {
        const settings = await browser.storage.local.get([
            'languageLearningEnabled',
            'targetLanguage', 
            'difficulty',
            'replacementPercentage',
            'deeplApiKey'
        ]);
        
        this.settings = {
            languageLearningEnabled: settings.languageLearningEnabled || false,
            targetLanguage: settings.targetLanguage || 'fr',
            difficulty: settings.difficulty || 'beginner',
            replacementPercentage: settings.replacementPercentage || 10
        };

        if (settings.deeplApiKey) {
            await this.deepLService.setAPIKey(settings.deeplApiKey);
        }
    }

    setupMessageListener() {
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            (async () => {
                try {
                    switch (request.action) {
                    case 'processWords':
                        await this.processWordsFromTab(request.words, sender.tab.id, request.targetLanguage);
                        sendResponse({success: true});
                        break;
                        
                    case 'updateSettings':
                        await this.updateSettings(request.settings);
                        sendResponse({success: true});
                        break;
                        
                    case 'getStats':
                        const stats = await this.getStats();
                        sendResponse(stats);
                        break;
                        
                    case 'clearCache':
                        await this.clearCache();
                        sendResponse({success: true});
                        break;
                        
                    case 'setApiKey':
                        try {
                            await this.deepLService.setAPIKey(request.apiKey);
                            await browser.storage.local.set({deeplApiKey: request.apiKey});
                            sendResponse({success: true});
                        } catch (error) {
                            console.error('Error setting API key:', error);
                            sendResponse({success: false, error: error.message});
                        }
                        break;
                        
                    case 'validateApiKey':
                        try {
                            await this.deepLService.setAPIKey(request.apiKey);
                            // Test the API key by getting supported languages
                            await this.deepLService.getSupportedLanguages();
                            sendResponse({success: true});
                        } catch (error) {
                            console.error('Error validating API key:', error);
                            sendResponse({success: false, error: error.message});
                        }
                        break;
                        
                    case 'markWordAsLearned':
                        await this.vocabularyTracker.markWordAsLearned(request.word);
                        sendResponse({success: true});
                        break;
                        
                    case 'markTranslationIncorrect':
                        await this.markTranslationIncorrect(request.word, request.translation);
                        sendResponse({success: true});
                        break;
                        
                    case 'setCustomTranslation':
                        await this.setCustomTranslation(request.word, request.translation);
                        sendResponse({success: true});
                        break;
                        
                    case 'blacklistWord':
                        await this.blacklistWord(request.word);
                        sendResponse({success: true});
                        break;
                        
                    case 'ping':
                        sendResponse({success: true, message: 'Background script is running'});
                        break;
                        
                        default:
                            sendResponse({success: false, error: 'Unknown action'});
                            return;
                    }
                } catch (error) {
                    console.error('Background script error:', error);
                    sendResponse({success: false, error: error.message});
                }
            })();
            
            return true; // Indicates async response
        });
    }

    async processWordsFromTab(words, tabId, targetLanguage) {
        // Create processing queue for this tab
        if (!this.translationQueue.has(tabId)) {
            this.translationQueue.set(tabId, []);
        }
        
        const queue = this.translationQueue.get(tabId);
        queue.push(...words);
        
        // Start processing if not already active for this tab
        if (!this.activeProcessing.has(tabId)) {
            this.activeProcessing.add(tabId);
            await this.processQueueForTab(tabId, targetLanguage);
            this.activeProcessing.delete(tabId);
        }
    }

    async processQueueForTab(tabId, targetLanguage) {
        const queue = this.translationQueue.get(tabId);
        if (!queue || queue.length === 0) return;

        const totalWords = queue.length;
        let processed = 0;

        // Send initial progress
        this.sendProgressToTab(tabId, 'Processing words...', 0, totalWords);

        // Process words in parallel batches to utilize full rate limit
        const batchSize = Math.min(25, this.rateLimiter.requestsPerSecond || 50); // Process up to 25 at once for better throughput
        
        while (queue.length > 0) {
            // Take a batch of words
            const batch = queue.splice(0, batchSize);
            
            // Process batch in parallel
            const batchPromises = batch.map(async (word) => {
                try {
                    // Rate limiting - wait if needed
                    await this.rateLimiter.waitForSlot();
                    
                    const translation = await this.deepLService.translate(word.text, targetLanguage);
                    
                    // Skip if translation is the same as original word
                    if (translation.text.toLowerCase().trim() !== word.text.toLowerCase().trim()) {
                        // Send translation result to content script
                        await this.sendTranslationToTab(tabId, {
                            ...word,
                            translation: translation.text
                        });
                        
                        // Track vocabulary
                        await this.vocabularyTracker.addWord(word.text, translation.text);
                    }
                    
                    return true; // Success
                } catch (error) {
                    console.error('Translation error:', error);
                    return false; // Failed
                }
            });
            
            // Wait for batch to complete
            await Promise.all(batchPromises);
            processed += batch.length;
            
            // Send progress updates
            this.sendProgressToTab(tabId, `Processing words... ${processed}/${totalWords}`, processed, totalWords);
        }

        // Send completion
        setTimeout(() => {
            this.sendProgressToTab(tabId, 'Ready', totalWords, totalWords);
        }, 100);
    }

    async sendTranslationToTab(tabId, wordData) {
        try {
            await browser.tabs.sendMessage(tabId, {
                action: 'translationReady',
                wordData: wordData
            });
        } catch (error) {
            // Tab might be closed or navigated away, that's fine
        }
    }

    sendProgressToTab(tabId, message, current, total) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        // Send to popup if it's listening
        try {
            browser.runtime.sendMessage({
                action: 'progressUpdate',
                message: message,
                current: current,
                total: total,
                percentage: percentage,
                tabId: tabId
            }).catch(() => {
                // Popup might not be open
            });
        } catch (error) {
            // Silently handle messaging errors
        }
    }

    async updateSettings(newSettings) {
        Object.assign(this.settings, newSettings);
        await browser.storage.local.set(this.settings);
    }

    async getStats() {
        const stats = await this.vocabularyTracker.getStats();
        return {
            ...stats,
            targetLanguage: this.settings.targetLanguage,
            difficulty: this.settings.difficulty,
            replacementPercentage: this.settings.replacementPercentage
        };
    }

    async clearCache() {
        await this.deepLService.clearCache();
        await this.vocabularyTracker.clear();
        // Also clear incorrect translations log
        await browser.storage.local.remove(['incorrectTranslations']);
    }
    
    async markTranslationIncorrect(word, translation) {
        // Remove from cache so it gets retranslated next time
        const cacheKey = this.deepLService.getCacheKey(word.toLowerCase().trim(), 'auto', this.settings.targetLanguage);
        this.deepLService.cache.delete(cacheKey);
        
        // Save updated cache
        await this.deepLService.saveCache();
        
        // Track as incorrect translation (could be used for user feedback/reports)
        const incorrectTranslations = await browser.storage.local.get('incorrectTranslations');
        const incorrect = incorrectTranslations.incorrectTranslations || [];
        incorrect.push({
            word: word,
            incorrectTranslation: translation,
            timestamp: Date.now(),
            targetLanguage: this.settings.targetLanguage
        });
        
        await browser.storage.local.set({ incorrectTranslations: incorrect });
    }
    
    async setCustomTranslation(word, translation) {
        // Set custom translation in cache
        const cacheKey = this.deepLService.getCacheKey(word.toLowerCase().trim(), 'auto', this.settings.targetLanguage);
        this.deepLService.cache.set(cacheKey, {
            text: translation,
            detectedSourceLang: 'auto',
            confidence: 1.0,
            timestamp: Date.now(),
            custom: true // Mark as user-provided
        });
        
        // Save cache
        await this.deepLService.saveCache();
        
        // Update vocabulary with custom translation
        await this.vocabularyTracker.addWord(word, translation);
    }
    
    async blacklistWord(word) {
        // Add to blacklist
        const stored = await browser.storage.local.get('wordBlacklist');
        const blacklist = stored.wordBlacklist || [];
        if (!blacklist.includes(word.toLowerCase())) {
            blacklist.push(word.toLowerCase());
            await browser.storage.local.set({ wordBlacklist: blacklist });
        }
        
        // Remove from cache
        const cacheKey = this.deepLService.getCacheKey(word.toLowerCase().trim(), 'auto', this.settings.targetLanguage);
        this.deepLService.cache.delete(cacheKey);
        await this.deepLService.saveCache();
    }
}

class BackgroundRateLimiter {
    constructor(requestsPerSecond = 5) {
        this.requestsPerSecond = requestsPerSecond;
        this.requests = [];
        this.intervalMs = 1000 / requestsPerSecond; // Time between requests
        this.lastRequest = 0;
    }

    async waitForSlot() {
        const now = Date.now();
        
        // Clean up old requests (older than 1 second)
        this.requests = this.requests.filter(time => now - time < 1000);
        
        // If we have space in the current window, use it immediately
        if (this.requests.length < this.requestsPerSecond) {
            this.requests.push(now);
            return;
        }
        
        // We're at the limit - calculate minimal wait time
        const oldestRequest = Math.min(...this.requests);
        const timeSinceOldest = now - oldestRequest;
        const waitTime = Math.max(0, 1000 - timeSinceOldest + 1); // Wait until oldest request is >1000ms old
        
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Clean up again and record this request
        const currentTime = Date.now();
        this.requests = this.requests.filter(time => currentTime - time < 1000);
        this.requests.push(currentTime);
    }
}

class VocabularyTracker {
    constructor() {
        this.vocabulary = new Map();
        this.learnedWords = new Set();
        this.loadVocabulary();
    }

    async loadVocabulary() {
        const stored = await browser.storage.local.get(['vocabulary', 'learnedWords']);
        
        if (stored.vocabulary) {
            this.vocabulary = new Map(Object.entries(stored.vocabulary));
        }
        
        if (stored.learnedWords) {
            this.learnedWords = new Set(stored.learnedWords);
        }
    }

    async addWord(original, translation) {
        const key = original.toLowerCase();
        this.vocabulary.set(key, {
            original,
            translation,
            encounters: (this.vocabulary.get(key)?.encounters || 0) + 1,
            firstSeen: this.vocabulary.get(key)?.firstSeen || Date.now(),
            lastSeen: Date.now()
        });
        
        await this.saveVocabulary();
    }

    async markWordAsLearned(word) {
        this.learnedWords.add(word.toLowerCase());
        await this.saveVocabulary();
    }

    async saveVocabulary() {
        await browser.storage.local.set({
            vocabulary: Object.fromEntries(this.vocabulary),
            learnedWords: Array.from(this.learnedWords)
        });
    }

    async getStats() {
        return {
            vocabularySize: this.vocabulary.size,
            learnedWords: this.learnedWords.size
        };
    }

    async clear() {
        this.vocabulary.clear();
        this.learnedWords.clear();
        await browser.storage.local.remove(['vocabulary', 'learnedWords']);
    }
}

// Initialize background script
new LanguageLearningBackground();