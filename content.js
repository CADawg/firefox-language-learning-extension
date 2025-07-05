class LanguageLearningContent {
    constructor() {
        this.deepLService = new DeepLService();
        this.isEnabled = false;
        this.targetLanguage = 'fr';
        this.difficulty = 'beginner';
        this.replacementPercentage = 10;
        this.processedWords = new Set();
        this.vocabularyTracker = new VocabularyTracker();
        this.tooltip = null;
        this.progressIndicator = null;
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.createTooltip();
        this.createProgressIndicator();
        
        if (this.isEnabled) {
            this.processPage();
        }
        
        this.setupMessageListener();
    }

    async loadSettings() {
        const settings = await browser.storage.local.get([
            'languageLearningEnabled',
            'targetLanguage',
            'difficulty',
            'replacementPercentage'
        ]);
        
        this.isEnabled = settings.languageLearningEnabled || false;
        this.targetLanguage = settings.targetLanguage || 'fr';
        this.difficulty = settings.difficulty || 'beginner';
        this.replacementPercentage = settings.replacementPercentage || 10;
    }

    setupMessageListener() {
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'toggleLearning':
                    this.toggleLearning();
                    sendResponse({success: true});
                    break;
                case 'updateSettings':
                    this.updateSettings(request.settings);
                    sendResponse({success: true});
                    break;
                case 'getStats':
                    sendResponse(this.getStats());
                    break;
                default:
                    return false;
            }
            return true;
        });
    }

    async toggleLearning() {
        this.isEnabled = !this.isEnabled;
        await browser.storage.local.set({ languageLearningEnabled: this.isEnabled });
        
        if (this.isEnabled) {
            this.processPage();
            this.showProgress('Learning enabled!');
        } else {
            this.clearReplacements();
            this.showProgress('Learning disabled');
        }
    }

    async updateSettings(settings) {
        Object.assign(this, settings);
        await browser.storage.local.set(settings);
        
        if (this.isEnabled) {
            this.clearReplacements();
            this.processPage();
        }
    }

    async processPage() {
        const textNodes = this.getTextNodes();
        const wordsToProcess = this.selectWordsForReplacement(textNodes);
        
        let processed = 0;
        for (const { node, word, index } of wordsToProcess) {
            try {
                await this.processWord(node, word, index);
                processed++;
                
                if (processed % 5 === 0) {
                    this.updateProgress(processed, wordsToProcess.length);
                }
            } catch (error) {
                console.error('Error processing word:', word, error);
            }
        }
        
        this.showProgress(`Processed ${processed} words`, 2000);
    }

    getTextNodes() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentNode;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    if (parent.isContentEditable) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return node.textContent.trim().length > 0 ? 
                        NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        return textNodes;
    }

    selectWordsForReplacement(textNodes) {
        const wordsToProcess = [];
        
        textNodes.forEach(node => {
            const text = node.textContent;
            const words = text.match(/\b[a-zA-Z]+\b/g) || [];
            
            words.forEach(word => {
                if (this.shouldReplaceWord(word)) {
                    const index = text.indexOf(word);
                    if (index !== -1) {
                        wordsToProcess.push({ node, word, index });
                    }
                }
            });
        });
        
        const targetCount = Math.ceil(wordsToProcess.length * (this.replacementPercentage / 100));
        return this.shuffleArray(wordsToProcess).slice(0, targetCount);
    }

    shouldReplaceWord(word) {
        if (word.length < 3 || word.length > 15) return false;
        if (this.processedWords.has(word.toLowerCase())) return false;
        
        const commonWords = {
            beginner: ['the', 'and', 'you', 'are', 'have', 'this', 'that', 'with', 'they', 'from'],
            intermediate: ['because', 'through', 'during', 'before', 'after', 'above', 'below', 'between'],
            advanced: ['nevertheless', 'consequently', 'furthermore', 'moreover', 'therefore', 'however']
        };
        
        return !commonWords[this.difficulty].includes(word.toLowerCase());
    }

    async processWord(node, word, index) {
        try {
            const translation = await this.deepLService.translate(word, this.targetLanguage);
            
            // Skip if translation is the same as original word (case-insensitive)
            if (translation.text.toLowerCase().trim() === word.toLowerCase().trim()) {
                return;
            }
            
            this.createWordReplacement(node, word, translation, index);
            this.processedWords.add(word.toLowerCase());
            this.vocabularyTracker.addWord(word, translation.text);
        } catch (error) {
            // Silently skip failed translations to avoid console spam
            return;
        }
    }

    createWordReplacement(node, originalWord, translation, index) {
        // Check if node is still in DOM and has a parent
        if (!node || !node.parentNode || !document.contains(node)) {
            return;
        }
        
        const text = node.textContent;
        const beforeText = text.substring(0, index);
        const afterText = text.substring(index + originalWord.length);
        
        const wrapper = document.createElement('span');
        wrapper.appendChild(document.createTextNode(beforeText));
        
        const translatedSpan = document.createElement('span');
        translatedSpan.className = `language-learning-word ${this.difficulty}`;
        translatedSpan.textContent = translation.text;
        translatedSpan.setAttribute('data-original', originalWord);
        translatedSpan.setAttribute('data-translation', translation.text);
        translatedSpan.setAttribute('data-difficulty', this.difficulty);
        
        this.setupWordEvents(translatedSpan, originalWord, translation.text);
        
        wrapper.appendChild(translatedSpan);
        wrapper.appendChild(document.createTextNode(afterText));
        
        try {
            // Double-check parent still exists before replacing
            if (node.parentNode && document.contains(node)) {
                node.parentNode.replaceChild(wrapper, node);
            }
        } catch (error) {
            // Silently handle DOM manipulation errors
            return;
        }
    }

    setupWordEvents(element, originalWord, translation) {
        element.addEventListener('mouseenter', (e) => {
            this.showTooltip(e, originalWord, translation);
        });
        
        element.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
        
        element.addEventListener('click', (e) => {
            e.preventDefault();
            this.vocabularyTracker.markWordAsLearned(originalWord);
            this.showProgress(`"${originalWord}" marked as learned!`, 1500);
        });
    }

    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'language-learning-tooltip';
        document.body.appendChild(this.tooltip);
    }

    showTooltip(event, originalWord, translation) {
        const rect = event.target.getBoundingClientRect();
        
        this.tooltip.innerHTML = `
            <div class="original-text">${originalWord}</div>
            <div class="translation">${translation}</div>
            <div class="difficulty">Difficulty: ${this.difficulty}</div>
        `;
        
        // Reset classes
        this.tooltip.className = 'language-learning-tooltip';
        
        // Show tooltip to get its dimensions
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.display = 'block';
        
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Calculate horizontal position
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        
        // Keep tooltip within viewport bounds
        if (left < 10) left = 10;
        if (left + tooltipRect.width > viewportWidth - 10) {
            left = viewportWidth - tooltipRect.width - 10;
        }
        
        // Calculate vertical position and determine arrow direction
        let top = rect.top - tooltipRect.height - 10;
        let isAbove = true;
        
        // If tooltip would go above viewport, show it below the word
        if (top < 10) {
            top = rect.bottom + 10;
            isAbove = false;
        }
        
        // Add appropriate class for arrow direction
        this.tooltip.classList.add(isAbove ? 'above' : 'below');
        
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.visibility = 'visible';
        this.tooltip.classList.add('show');
    }

    hideTooltip() {
        this.tooltip.classList.remove('show');
    }

    createProgressIndicator() {
        this.progressIndicator = document.createElement('div');
        this.progressIndicator.className = 'language-learning-progress';
        document.body.appendChild(this.progressIndicator);
    }

    showProgress(message, duration = 3000) {
        this.progressIndicator.textContent = message;
        this.progressIndicator.classList.add('show');
        
        setTimeout(() => {
            this.progressIndicator.classList.remove('show');
        }, duration);
    }

    updateProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        this.progressIndicator.innerHTML = `
            Processing words... ${current}/${total}
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
        `;
        this.progressIndicator.classList.add('show');
    }

    clearReplacements() {
        const replacedWords = document.querySelectorAll('.language-learning-word');
        replacedWords.forEach(word => {
            try {
                // Check if the word still has a parent node
                if (word.parentNode && document.contains(word)) {
                    const originalText = word.getAttribute('data-original');
                    const textNode = document.createTextNode(originalText);
                    word.parentNode.replaceChild(textNode, word);
                }
            } catch (error) {
                // Silently handle DOM manipulation errors
            }
        });
        
        this.processedWords.clear();
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    getStats() {
        return {
            processedWords: this.processedWords.size,
            vocabularySize: this.vocabularyTracker.getVocabularySize(),
            targetLanguage: this.targetLanguage,
            difficulty: this.difficulty,
            replacementPercentage: this.replacementPercentage
        };
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

    addWord(original, translation) {
        this.vocabulary.set(original.toLowerCase(), {
            original,
            translation,
            encounters: (this.vocabulary.get(original.toLowerCase())?.encounters || 0) + 1,
            firstSeen: this.vocabulary.get(original.toLowerCase())?.firstSeen || Date.now(),
            lastSeen: Date.now()
        });
        
        this.saveVocabulary();
    }

    markWordAsLearned(word) {
        this.learnedWords.add(word.toLowerCase());
        this.saveVocabulary();
    }

    async saveVocabulary() {
        await browser.storage.local.set({
            vocabulary: Object.fromEntries(this.vocabulary),
            learnedWords: Array.from(this.learnedWords)
        });
    }

    getVocabularySize() {
        return this.vocabulary.size;
    }

    getLearnedWordsCount() {
        return this.learnedWords.size;
    }
}

console.log('Language Learning Content Script loaded');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LanguageLearningContent();
    });
} else {
    new LanguageLearningContent();
}