class ServerAPI {
    constructor() {
        // Automatically detect environment and set appropriate server URL
        this.baseURL = this.getServerURL();
        this.userID = null;
        this.extensionGUID = null;
        this.isRegistered = false;
        
        this.init();
    }

    getServerURL() {
        // Check if DEV_MODE flag was set during build
        if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
            console.log('Development mode - using localhost server');
            return 'http://localhost:8090';
        } else {
            console.log('Production mode - using production server');
            return 'https://fluent-tab.dbuidl.com';
        }
    }

    async init() {
        // Get extension GUID and registration status from storage
        const data = await browser.storage.local.get('extensionData');
        if (data.extensionData && data.extensionData.extensionGuid) {
            this.extensionGUID = data.extensionData.extensionGuid;
            this.userID = data.extensionData.userID || null;
            this.isRegistered = data.extensionData.isRegistered || false;
            console.log('Found existing extension GUID:', this.extensionGUID, 'registered:', this.isRegistered);
        } else {
            // Generate GUID if it doesn't exist
            this.extensionGUID = this.generateGUID();
            console.log('Generated new extension GUID:', this.extensionGUID);
            await browser.storage.local.set({
                extensionData: {
                    extensionGuid: this.extensionGUID,
                    installDate: new Date().toISOString(),
                    isRegistered: false
                }
            });
        }
        
        // Only register if not already registered
        if (!this.isRegistered) {
            await this.registerUser();
        } else {
            console.log('Already registered with server, userID:', this.userID);
        }
    }

    generateGUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async registerUser() {
        if (!this.extensionGUID) {
            console.error('No extension GUID available');
            return false;
        }

        try {
            const response = await fetch(`${this.baseURL}/api/extension/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    extension_guid: this.extensionGUID,
                    extension_version: '1.0',
                    browser_info: {
                        userAgent: navigator.userAgent,
                        language: navigator.language,
                        platform: navigator.platform
                    }
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.userID = result.user_id;
                this.isRegistered = true;
                
                // Save registration status to storage
                const data = await browser.storage.local.get('extensionData');
                await browser.storage.local.set({
                    extensionData: {
                        ...data.extensionData,
                        userID: this.userID,
                        isRegistered: true
                    }
                });
                
                console.log('Successfully registered with server:', result.message);
                return true;
            } else {
                console.error('Failed to register with server:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Server registration error:', error);
            return false;
        }
    }

    async translateWords(words, sourceLanguage, targetLanguage, difficultyLevel) {
        if (!this.isRegistered) {
            console.log('Not registered with server, skipping server translation');
            return [];
        }

        try {
            const response = await fetch(`${this.baseURL}/api/extension/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    words: words,
                    source_language: sourceLanguage,
                    target_language: targetLanguage,
                    difficulty_level: difficultyLevel,
                    user_uuid: this.userID
                })
            });

            if (response.ok) {
                const translations = await response.json();
                console.log(`Received ${translations.length} translations from server`);
                return translations;
            } else {
                console.error('Translation request failed:', response.status);
                return [];
            }
        } catch (error) {
            console.error('Server translation error:', error);
            return [];
        }
    }

    async submitFeedback(originalWord, translatedWord, feedbackType, customTranslation = null, contextURL = null) {
        if (!this.isRegistered) {
            console.log('Not registered with server, skipping feedback submission');
            return false;
        }

        try {
            const response = await fetch(`${this.baseURL}/api/extension/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_uuid: this.userID,
                    original_word: originalWord,
                    translated_word: translatedWord,
                    source_language: 'auto',
                    target_language: 'current', // Will be set by server based on user preferences
                    feedback_type: feedbackType,
                    custom_translation: customTranslation,
                    context_url: contextURL
                })
            });

            if (response.ok) {
                console.log('Feedback submitted successfully');
                return true;
            } else {
                console.error('Feedback submission failed:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Server feedback error:', error);
            return false;
        }
    }

    // Check if server is available
    async isServerAvailable() {
        try {
            const response = await fetch(`${this.baseURL}/api/stats`, {
                method: 'GET',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}