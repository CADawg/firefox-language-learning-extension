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

browser.browserAction.onClicked.addListener((tab) => {
    console.log('Language Learning Extension icon clicked for tab:', tab.id);
});

browser.tabs.onActivated.addListener((activeInfo) => {
    console.log('Tab activated:', activeInfo.tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab updated:', tab.url);
        
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
            notifyContentScript(tabId);
        }
    }
});

async function notifyContentScript(tabId) {
    try {
        const settings = await browser.storage.local.get(['languageLearningEnabled']);
        if (settings.languageLearningEnabled) {
            setTimeout(() => {
                browser.tabs.sendMessage(tabId, { action: 'pageUpdated' })
                    .catch(error => console.log('Content script not ready yet'));
            }, 1000);
        }
    } catch (error) {
        console.log('Error notifying content script:', error);
    }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background:', request);
    
    switch (request.action) {
        case 'getUsageStats':
            getUsageStats().then(sendResponse);
            return true;
            
        case 'exportAllData':
            exportAllData().then(sendResponse);
            return true;
            
        case 'clearAllData':
            clearAllData().then(sendResponse);
            return true;
            
        default:
            sendResponse({success: false, message: 'Unknown action'});
            return false;
    }
});

async function getUsageStats() {
    try {
        const data = await browser.storage.local.get([
            'vocabulary',
            'learnedWords',
            'translationCache',
            'extensionData'
        ]);
        
        const vocabularySize = data.vocabulary ? Object.keys(data.vocabulary).length : 0;
        const learnedWordsCount = data.learnedWords ? data.learnedWords.length : 0;
        const cacheSize = data.translationCache ? Object.keys(data.translationCache).length : 0;
        
        return {
            success: true,
            stats: {
                vocabularySize,
                learnedWordsCount,
                cacheSize,
                installDate: data.extensionData?.installDate
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function exportAllData() {
    try {
        const data = await browser.storage.local.get();
        return {
            success: true,
            data: data
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function clearAllData() {
    try {
        const keysToKeep = ['extensionData', 'deeplApiKey'];
        const allData = await browser.storage.local.get();
        
        const keysToRemove = Object.keys(allData).filter(key => !keysToKeep.includes(key));
        await browser.storage.local.remove(keysToRemove);
        
        return {
            success: true,
            message: 'All learning data cleared'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

browser.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        console.log('Storage changed:', changes);
        
        if (changes.languageLearningEnabled) {
            console.log('Language learning toggled:', changes.languageLearningEnabled.newValue);
        }
    }
});