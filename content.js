class LanguageLearningContent {
    constructor() {
        this.isEnabled = false;
        this.targetLanguage = 'fr';
        this.difficulty = 'beginner';
        this.replacementPercentage = 10;
        this.processedWords = new Set();
        this.tooltip = null;
        this.pendingReplacements = new Map(); // Store nodes waiting for translations
        this.isTooltipHovered = false; // Track tooltip hover state
        this.hideTooltipTimeout = null; // Track hide timeout
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.createTooltip();
        
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
                case 'translationReady':
                    this.handleTranslationReady(request.wordData);
                    sendResponse({success: true});
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
        } else {
            this.clearReplacements();
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
        const wordsToProcess = await this.selectWordsForReplacement(textNodes);
        
        if (wordsToProcess.length === 0) {
            return;
        }
        
        // Store pending replacements for when translations come back
        wordsToProcess.forEach(({ node, word, index }) => {
            const key = `${word.toLowerCase()}_${Date.now()}_${Math.random()}`;
            this.pendingReplacements.set(key, { node, word, index });
        });
        
        // Send words to background for processing
        const wordsData = wordsToProcess.map(({ word, index }, i) => ({
            text: word,
            index: index,
            id: `${word.toLowerCase()}_${Date.now()}_${Math.random()}`
        }));
        
        try {
            await browser.runtime.sendMessage({
                action: 'processWords',
                words: wordsData,
                targetLanguage: this.targetLanguage
            });
        } catch (error) {
            console.error('Error sending words to background:', error);
        }
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

    async selectWordsForReplacement(textNodes) {
        const wordsToProcess = [];
        
        for (const node of textNodes) {
            const text = node.textContent;
            
            // For intermediate/advanced, also look for multi-word phrases
            if (this.difficulty === 'intermediate' || this.difficulty === 'advanced') {
                const phrases = this.extractPhrases(text);
                phrases.forEach(phrase => {
                    if (this.shouldReplacePhrase(phrase.text)) {
                        wordsToProcess.push({ node, word: phrase.text, index: phrase.index });
                    }
                });
            }
            
            // Always include single words (including contractions)
            const words = text.match(/\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g) || [];
            
            for (const word of words) {
                if (await this.shouldReplaceWord(word)) {
                    const index = text.indexOf(word);
                    if (index !== -1) {
                        wordsToProcess.push({ node, word, index });
                    }
                }
            }
        }
        
        const targetCount = Math.ceil(wordsToProcess.length * (this.replacementPercentage / 100));
        return this.shuffleArray(wordsToProcess).slice(0, targetCount);
    }

    extractPhrases(text) {
        const phrases = [];
        
        // Common 2-3 word phrases for intermediate/advanced
        const phrasePatterns = {
            intermediate: [
                /\b(?:in order to|as well as|more than|less than|such as|rather than|along with|instead of)\b/gi,
                /\b(?:due to|according to|apart from|because of|in spite of|on behalf of)\b/gi,
                /\b(?:make sure|take place|find out|carry out|look forward|break down)\b/gi
            ],
            advanced: [
                /\b(?:in addition to|with regard to|in accordance with|on the other hand|as a result of|in contrast to)\b/gi,
                /\b(?:take into account|bring to light|come to terms with|get rid of|make use of|put up with)\b/gi,
                /\b(?:for the sake of|by means of|in the course of|at the expense of|in the face of)\b/gi
            ]
        };
        
        const patterns = phrasePatterns[this.difficulty] || [];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                phrases.push({
                    text: match[0],
                    index: match.index
                });
            }
        });
        
        return phrases;
    }
    
    shouldReplacePhrase(phrase) {
        if (phrase.length < 5 || phrase.length > 30) return false;
        if (this.processedWords.has(phrase.toLowerCase())) return false;
        return true;
    }
    
    async shouldReplaceWord(word) {
        if (word.length < 3 || word.length > 20) return false; // Increased length limit for contractions
        if (this.processedWords.has(word.toLowerCase())) return false;
        
        // Check blacklist
        const stored = await browser.storage.local.get('wordBlacklist');
        const blacklist = stored.wordBlacklist || [];
        if (blacklist.includes(word.toLowerCase())) return false;
        
        const commonWords = {
            beginner: ['the', 'and', 'you', 'are', 'have', 'this', 'that', 'with', 'they', 'from', "don't", "won't", "can't", "it's", "i'm", "you're", "they're", "we're"],
            intermediate: ['because', 'through', 'during', 'before', 'after', 'above', 'below', 'between', "couldn't", "wouldn't", "shouldn't", "haven't", "hasn't", "hadn't"],
            advanced: ['nevertheless', 'consequently', 'furthermore', 'moreover', 'therefore', 'however', "wouldn't've", "shouldn't've", "couldn't've"]
        };
        
        return !commonWords[this.difficulty].includes(word.toLowerCase());
    }

    handleTranslationReady(wordData) {
        // Find the matching pending replacement
        const pendingKey = Array.from(this.pendingReplacements.keys())
            .find(key => key.startsWith(wordData.text.toLowerCase()));
        
        if (!pendingKey) {
            return; // No matching pending replacement
        }
        
        const { node, word, index } = this.pendingReplacements.get(pendingKey);
        this.pendingReplacements.delete(pendingKey);
        
        // Create the word replacement
        this.createWordReplacement(node, word, { text: wordData.translation }, index);
        this.processedWords.add(word.toLowerCase());
    }

    createWordReplacement(node, originalWord, translation, index) {
        // Check if node is still in DOM and has a parent
        if (!node || !node.parentNode || !document.contains(node)) {
            return;
        }
        
        const text = node.textContent;
        const beforeText = text.substring(0, index);
        const afterText = text.substring(index + originalWord.length);
        
        // Create a document fragment to hold the new structure
        const fragment = document.createDocumentFragment();
        
        // Add text before the word
        if (beforeText) {
            fragment.appendChild(document.createTextNode(beforeText));
        }
        
        // Create the translated span
        const translatedSpan = document.createElement('span');
        translatedSpan.className = `language-learning-word ${this.difficulty}`;
        
        // Apply capitalization matching
        const capitalizedTranslation = this.matchCapitalization(originalWord, translation.text);
        translatedSpan.textContent = capitalizedTranslation;
        translatedSpan.setAttribute('data-original', originalWord);
        translatedSpan.setAttribute('data-translation', translation.text);
        translatedSpan.setAttribute('data-difficulty', this.difficulty);
        
        this.setupWordEvents(translatedSpan, originalWord, translation.text);
        
        fragment.appendChild(translatedSpan);
        
        // Add text after the word
        if (afterText) {
            fragment.appendChild(document.createTextNode(afterText));
        }
        
        try {
            // Replace the text node with the fragment containing the span
            if (node.parentNode && document.contains(node)) {
                node.parentNode.replaceChild(fragment, node);
            }
        } catch (error) {
            // Silently handle DOM manipulation errors
            return;
        }
    }

    setupWordEvents(element, originalWord, translation) {
        element.addEventListener('mouseenter', (e) => {
            // Only show hover tooltip if no tooltip is currently pinned
            if (!this.tooltip.classList.contains('pinned')) {
                this.showTooltip(e, originalWord, translation, false);
            }
        });
        
        element.addEventListener('mouseleave', () => {
            // Only hide if tooltip is not pinned
            if (!this.tooltip.classList.contains('pinned')) {
                this.hideTooltipTimeout = setTimeout(() => {
                    if (!this.isTooltipHovered && !this.tooltip.classList.contains('pinned')) {
                        this.hideTooltip();
                    }
                }, 150); // Longer delay for easier hover transition
            }
        });
        
        element.addEventListener('click', (e) => {
            // Check if this translated word is inside a link
            const link = e.target.closest('a');
            if (link) {
                // Allow the link to work normally - don't preventDefault
                return;
            }
            
            // Prevent default and show pinned tooltip
            e.preventDefault();
            e.stopPropagation();
            this.showTooltip(e, originalWord, translation, true);
        });
    }

    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'language-learning-tooltip';
        document.body.appendChild(this.tooltip);
        
        // Add global click listener to close pinned tooltips
        document.addEventListener('click', (e) => {
            if (this.tooltip.classList.contains('pinned') && 
                !this.tooltip.contains(e.target) && 
                !e.target.classList.contains('language-learning-word')) {
                this.hideTooltip();
            }
        });
    }

    showTooltip(event, originalWord, translation, pinned = false) {
        const rect = event.target.getBoundingClientRect();
        
        this.tooltip.innerHTML = `
            <div class="original-text">${originalWord}</div>
            <div class="translation">${translation}</div>
            <div class="difficulty">Difficulty: ${this.difficulty.charAt(0).toUpperCase() + this.difficulty.slice(1)}</div>
            <div class="tooltip-actions">
                <button class="tooltip-btn learned-btn" data-action="learned" data-word="${originalWord}">✓ Learned</button>
                <button class="tooltip-btn incorrect-btn" data-action="incorrect" data-word="${originalWord}" data-translation="${translation}">✗ Incorrect</button>
            </div>
            ${pinned ? '<div class="tooltip-hint">Click outside to close</div>' : ''}
        `;
        
        // Add event listeners to the buttons
        this.tooltip.querySelectorAll('.tooltip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const word = btn.dataset.word;
                const trans = btn.dataset.translation;
                
                if (action === 'learned') {
                    this.markWordAsLearned(word);
                    this.hideTooltip();
                } else if (action === 'incorrect') {
                    this.handleIncorrectTranslation(word, trans);
                    this.hideTooltip();
                }
            });
        });
        
        // Add hover events to tooltip itself for better UX
        this.tooltip.addEventListener('mouseenter', () => {
            this.isTooltipHovered = true;
            // Cancel any pending hide timeout
            if (this.hideTooltipTimeout) {
                clearTimeout(this.hideTooltipTimeout);
                this.hideTooltipTimeout = null;
            }
        });
        
        this.tooltip.addEventListener('mouseleave', () => {
            this.isTooltipHovered = false;
            // Hide tooltip when leaving it (unless pinned)
            if (!this.tooltip.classList.contains('pinned')) {
                this.hideTooltip();
            }
        });
        
        // Reset base classes but preserve pinned state
        this.tooltip.className = 'language-learning-tooltip';
        
        // Set pinned state after resetting classes
        if (pinned) {
            this.tooltip.classList.add('pinned');
        }
        
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
        this.tooltip.classList.remove('show', 'pinned');
        this.isTooltipHovered = false;
        // Clear any pending timeout
        if (this.hideTooltipTimeout) {
            clearTimeout(this.hideTooltipTimeout);
            this.hideTooltipTimeout = null;
        }
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

    matchCapitalization(originalWord, translatedWord) {
        if (!originalWord || !translatedWord) return translatedWord;
        
        // Handle multi-word phrases
        if (originalWord.includes(' ')) {
            const originalWords = originalWord.split(' ');
            const translatedWords = translatedWord.split(' ');
            
            // Match capitalization word by word if possible
            if (originalWords.length === translatedWords.length) {
                return translatedWords.map((word, i) => {
                    const original = originalWords[i] || originalWords[0];
                    return this.matchSingleWordCapitalization(original, word);
                }).join(' ');
            }
            
            // If word counts don't match, just match the first word's capitalization
            const firstOriginal = originalWords[0];
            return this.matchSingleWordCapitalization(firstOriginal, translatedWord);
        }
        
        return this.matchSingleWordCapitalization(originalWord, translatedWord);
    }
    
    matchSingleWordCapitalization(originalWord, translatedWord) {
        if (!originalWord || !translatedWord) return translatedWord;
        
        // All uppercase
        if (originalWord === originalWord.toUpperCase()) {
            return translatedWord.toUpperCase();
        }
        
        // First letter uppercase, rest lowercase
        if (originalWord[0] === originalWord[0].toUpperCase() && 
            originalWord.slice(1) === originalWord.slice(1).toLowerCase()) {
            return translatedWord.charAt(0).toUpperCase() + translatedWord.slice(1).toLowerCase();
        }
        
        // All lowercase (or mixed case - default to lowercase)
        return translatedWord.toLowerCase();
    }

    async markWordAsLearned(word) {
        try {
            await browser.runtime.sendMessage({
                action: 'markWordAsLearned',
                word: word
            });
        } catch (error) {
            console.error('Error marking word as learned:', error);
        }
    }
    
    async handleIncorrectTranslation(word, translation) {
        // Show dialog with options
        const options = [
            "Cancel",
            "Never translate this word",
            "Provide correct translation",
            "Just mark as incorrect"
        ];
        
        const choice = this.showCustomDialog(
            `"${word}" → "${translation}"\n\nWhat would you like to do?`,
            options
        );
        
        if (choice === 1) {
            // Never translate
            await this.blacklistWord(word);
        } else if (choice === 2) {
            // Provide correct translation
            const correctTranslation = prompt(`What should "${word}" translate to?`);
            if (correctTranslation && correctTranslation.trim()) {
                await this.setCustomTranslation(word, correctTranslation.trim());
            }
        } else if (choice === 3) {
            // Just mark as incorrect
            await this.markTranslationIncorrect(word, translation);
        }
        // Choice 0 = Cancel, do nothing
    }
    
    showCustomDialog(message, options) {
        // Simple implementation using confirm/prompt for now
        // Could be enhanced with a custom modal later
        const choice = prompt(
            message + "\n\n" +
            options.map((opt, i) => `${i}: ${opt}`).join("\n") +
            "\n\nEnter your choice (0-" + (options.length - 1) + "):"
        );
        
        const choiceNum = parseInt(choice);
        return (choiceNum >= 0 && choiceNum < options.length) ? choiceNum : 0;
    }
    
    async markTranslationIncorrect(word, translation) {
        try {
            await browser.runtime.sendMessage({
                action: 'markTranslationIncorrect',
                word: word,
                translation: translation
            });
        } catch (error) {
            console.error('Error marking translation as incorrect:', error);
        }
    }
    
    async setCustomTranslation(word, translation) {
        try {
            await browser.runtime.sendMessage({
                action: 'setCustomTranslation',
                word: word,
                translation: translation
            });
        } catch (error) {
            console.error('Error setting custom translation:', error);
        }
    }
    
    async blacklistWord(word) {
        try {
            await browser.runtime.sendMessage({
                action: 'blacklistWord',
                word: word
            });
        } catch (error) {
            console.error('Error blacklisting word:', error);
        }
    }

    async getStats() {
        try {
            const stats = await browser.runtime.sendMessage({
                action: 'getStats'
            });
            return {
                processedWords: this.processedWords.size,
                vocabularySize: stats.vocabularySize || 0,
                learnedWords: stats.learnedWords || 0,
                targetLanguage: this.targetLanguage,
                difficulty: this.difficulty,
                replacementPercentage: this.replacementPercentage
            };
        } catch (error) {
            return {
                processedWords: this.processedWords.size,
                vocabularySize: 0,
                learnedWords: 0,
                targetLanguage: this.targetLanguage,
                difficulty: this.difficulty,
                replacementPercentage: this.replacementPercentage
            };
        }
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