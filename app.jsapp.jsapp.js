const RCE = require('b1nzeex/rce.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WebSocket = require('ws');
const express = require('express');

// Initialize Brindanator bot
class Brindanator {
    constructor() {
        this.name = 'Brindanator';
        this.version = '1.0.0';
        this.rce = new RCE({
            serverUrl: 'rust.facepunch.com:28015',
            username: process.env.RUST_USERNAME || 'Brindanator',
            password: process.env.RUST_PASSWORD || ''
        });
        
        // Initialize Gemini AI
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        this.isConnected = false;
        this.chatHistory = [];
        this.players = new Map();
    }

    async initialize() {
        try {
            console.log(`🤖 Starting ${this.name} v${this.version}`);
            
            // Connect to Rust server via RCE
            await this.connectToServer();
            
            // Set up event listeners
            this.setupEventListeners();
            
            console.log('✅ Brindanator initialized successfully!');
        } catch (error) {
            console.error('❌ Failed to initialize Brindanator:', error);
        }
    }

    async connectToServer() {
        return new Promise((resolve, reject) => {
            this.rce.connect()
                .then(() => {
                    this.isConnected = true;
                    console.log('🔗 Connected to Rust Console Edition server');
                    resolve();
                })
                .catch(reject);
        });
    }

    setupEventListeners() {
        // Listen for chat messages
        this.rce.on('chatMessage', async (message) => {
            await this.handleChatMessage(message);
        });

        // Listen for player events
        this.rce.on('playerJoined', (player) => {
            this.players.set(player.steamId, player);
            this.sendMessage(`👋 Welcome ${player.name} to the server! I'm Brindanator, your AI assistant.`);
        });

        this.rce.on('playerLeft', (player) => {
            this.players.delete(player.steamId);
            this.sendMessage(`👋 Goodbye ${player.name}!`);
        });

        // Handle disconnection
        this.rce.on('disconnect', () => {
            this.isConnected = false;
            console.log('🔌 Disconnected from server');
            this.reconnect();
        });
    }

    async handleChatMessage(message) {
        try {
            // Skip if it's from the bot itself
            if (message.author === this.name) return;

            // Check if message mentions the bot
            const mentionsBot = message.content.toLowerCase().includes('brindanator') || 
                               message.content.startsWith('!') ||
                               message.content.startsWith('?');

            if (mentionsBot) {
                // Clean the message for AI processing
                const cleanMessage = message.content
                    .replace(/brindanator/gi, '')
                    .replace(/^[!?]/, '')
                    .trim();

                if (cleanMessage) {
                    const response = await this.generateAIResponse(cleanMessage, message.author);
                    this.sendMessage(`@${message.author}: ${response}`);
                }
            }

            // Store chat history
            this.chatHistory.push({
                timestamp: Date.now(),
                author: message.author,
                content: message.content
            });

            // Keep only last 100 messages
            if (this.chatHistory.length > 100) {
                this.chatHistory = this.chatHistory.slice(-100);
            }

        } catch (error) {
            console.error('❌ Error handling chat message:', error);
        }
    }

    async generateAIResponse(message, playerName) {
        try {
            const context = `You are Brindanator, an AI assistant for a Rust Console Edition server. 
You're helpful, friendly, and knowledgeable about Rust gameplay. 
Keep responses concise (under 200 characters for chat).
Player "${playerName}" asks: ${message}`;

            const result = await this.model.generateContent(context);
            const response = await result.response;
            return response.text().substring(0, 200); // Limit length for chat

        } catch (error) {
            console.error('❌ AI generation error:', error);
            return 'Sorry, I\'m having trouble processing that right now! 🤖';
        }
    }

    sendMessage(message) {
        if (this.isConnected) {
            this.rce.sendMessage(message);
            console.log(`💬 Sent: ${message}`);
        }
    }

    async reconnect() {
        console.log('🔄 Attempting to reconnect...');
        setTimeout(() => {
            if (!this.isConnected) {
                this.connectToServer();
            }
        }, 5000);
    }

    // Admin commands
    handleAdminCommand(command, player) {
        // Add admin functionality here
        console.log(`🔧 Admin command from ${player}: ${command}`);
    }
}

// Initialize and start the bot
const bot = new Brindanator();

// Express server for health checks and status
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        name: 'Brindanator',
        version: '1.0.0',
        status: bot.isConnected ? 'Connected' : 'Disconnected',
        uptime: process.uptime(),
        playersOnline: bot.players.size
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    bot.initialize();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down Brindanator...');
    if (bot.isConnected) {
        bot.rce.disconnect();
    }
    process.exit(0);
});
