class DeepLService {
    constructor() {
        this.baseURL = 'https://api-free.deepl.com/v2';
        this.cache = new Map();
        this.rateLimiter = new RateLimiter(2, 2000);
        this.failedWords = new Set();
        this.initializeCache();
    }

    async initializeCache() {
        try {
            const stored = await browser.storage.local.get(['translationCache']);
            if (stored.translationCache) {
                this.cache = new Map(Object.entries(stored.translationCache));
                console.log(`Loaded ${this.cache.size} cached translations`);
            }
        } catch (error) {
            console.error('Error loading cache:', error);
        }
    }

    async saveCache() {
        try {
            const cacheObj = Object.fromEntries(this.cache);
            await browser.storage.local.set({ translationCache: cacheObj });
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    }

    getCacheKey(text, sourceLang, targetLang) {
        return `${text.toLowerCase().trim()}|${sourceLang}|${targetLang}`;
    }

    async getAPIKey() {
        const result = await browser.storage.local.get(['deeplApiKey']);
        return result.deeplApiKey;
    }

    async setAPIKey(apiKey) {
        await browser.storage.local.set({ deeplApiKey: apiKey });
    }

    async translate(text, targetLang, sourceLang = 'auto') {
        if (!text || text.trim().length === 0) {
            throw new Error('Empty text provided');
        }

        // Skip words that have failed before
        const failKey = text.toLowerCase().trim();
        if (this.failedWords.has(failKey)) {
            throw new Error('Word previously failed translation');
        }

        const cacheKey = this.getCacheKey(text, sourceLang, targetLang);
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const apiKey = await this.getAPIKey();
        if (!apiKey) {
            this.failedWords.add(failKey);
            throw new Error('DeepL API key not configured');
        }

        await this.rateLimiter.wait();

        try {
            const response = await this.makeAPIRequest(text, targetLang, sourceLang, apiKey);
            const translation = response.translations[0];
            
            const result = {
                text: translation.text,
                detectedSourceLang: translation.detected_source_language,
                confidence: 1.0,
                timestamp: Date.now()
            };

            this.cache.set(cacheKey, result);
            
            if (this.cache.size % 10 === 0) {
                await this.saveCache();
            }

            return result;
        } catch (error) {
            // Mark word as failed to avoid retrying
            this.failedWords.add(failKey);
            
            // Don't log 403/429 errors as they spam the console
            if (!error.message.includes('403') && !error.message.includes('429')) {
                console.error('Translation error:', error);
            }
            throw error;
        }
    }

    async makeAPIRequest(text, targetLang, sourceLang, apiKey) {
        const params = new URLSearchParams({
            text: text,
            target_lang: targetLang.toUpperCase(),
            auth_key: apiKey
        });

        if (sourceLang !== 'auto') {
            params.append('source_lang', sourceLang.toUpperCase());
        }

        const response = await fetch(`${this.baseURL}/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepL API error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    }

    async getSupportedLanguages() {
        const apiKey = await this.getAPIKey();
        if (!apiKey) {
            return this.getDefaultLanguages();
        }

        try {
            const response = await fetch(`${this.baseURL}/languages?auth_key=${apiKey}`);
            if (!response.ok) {
                return this.getDefaultLanguages();
            }
            
            const languages = await response.json();
            return languages.map(lang => ({
                code: lang.language.toLowerCase(),
                name: lang.name
            }));
        } catch (error) {
            console.error('Error fetching supported languages:', error);
            return this.getDefaultLanguages();
        }
    }

    getDefaultLanguages() {
        return [
            { code: 'en', name: 'English' },
            { code: 'es', name: 'Spanish' },
            { code: 'fr', name: 'French' },
            { code: 'de', name: 'German' },
            { code: 'it', name: 'Italian' },
            { code: 'pt', name: 'Portuguese' },
            { code: 'ru', name: 'Russian' },
            { code: 'ja', name: 'Japanese' },
            { code: 'ko', name: 'Korean' },
            { code: 'zh', name: 'Chinese' },
            { code: 'nl', name: 'Dutch' },
            { code: 'pl', name: 'Polish' }
        ];
    }

    async clearCache() {
        this.cache.clear();
        await browser.storage.local.remove(['translationCache']);
        console.log('Translation cache cleared');
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            estimatedMemory: JSON.stringify(Object.fromEntries(this.cache)).length
        };
    }
}

class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    async wait() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);
        
        if (this.requests.length >= this.maxRequests) {
            const waitTime = this.timeWindow - (now - this.requests[0]);
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        this.requests.push(now);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeepLService;
}