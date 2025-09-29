const Discord = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rce = require('rce.js');

// Initialize Discord client
const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.DirectMessages
    ]
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Bot configuration
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',') : [];
const PREFIX = '!';

// Initialize RCE for shell commands
const rceInstance = new rce.RCE();

client.once('ready', () => {
    console.log(`🚀 Brindanator Bot is online! Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    
    // Set bot status
    client.user.setActivity('Managing systems & AI responses', { type: Discord.ActivityType.Watching });
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Handle direct mentions and DMs
    const isDM = message.channel.type === Discord.ChannelType.DM;
    const isMentioned = message.mentions.has(client.user);
    const hasPrefix = message.content.startsWith(PREFIX);
    
    if (!isDM && !isMentioned && !hasPrefix) return;
    
    try {
        let content = message.content;
        
        // Remove prefix or mention
        if (hasPrefix) {
            content = content.slice(PREFIX.length).trim();
        } else if (isMentioned) {
            content = content.replace(`<@${client.user.id}>`, '').trim();
        }
        
        // Parse command and arguments
        const args = content.split(' ');
        const command = args.shift().toLowerCase();
        
        // Admin-only shell commands
        if (command === 'shell' || command === 'exec' || command === 'cmd') {
            if (!ADMIN_USER_IDS.includes(message.author.id)) {
                return message.reply('❌ Access denied. Admin privileges required.');
            }
            
            const shellCommand = args.join(' ');
            if (!shellCommand) {
                return message.reply('❌ Please provide a command to execute.');
            }
            
            await message.reply('⏳ Executing command...');
            
            try {
                const result = await rceInstance.exec(shellCommand, {
                    timeout: 30000, // 30 second timeout
                    maxBuffer: 1024 * 1024 // 1MB max output
                });
                
                let output = result.stdout || result.stderr || 'Command executed successfully (no output)';
                
                // Truncate long output
                if (output.length > 1900) {
                    output = output.substring(0, 1900) + '\n... (truncated)';
                }
                
                await message.reply({
                    content: `\`\`\`bash\n$ ${shellCommand}\n${output}\`\`\``,
                    allowedMentions: { repliedUser: false }
                });
                
            } catch (error) {
                await message.reply({
                    content: `\`\`\`bash\n$ ${shellCommand}\nError: ${error.message}\`\`\``,
                    allowedMentions: { repliedUser: false }
                });
            }
            return;
        }
        
        // System info command
        if (command === 'system' || command === 'info') {
            if (!ADMIN_USER_IDS.includes(message.author.id)) {
                return message.reply('❌ Access denied. Admin privileges required.');
            }
            
            try {
                const uptime = await rceInstance.exec('uptime');
                const memory = await rceInstance.exec('free -h');
                const disk = await rceInstance.exec('df -h /');
                const processes = await rceInstance.exec('ps aux --sort=-%cpu | head -5');
                
                const systemInfo = `\`\`\`bash
# System Information
${uptime.stdout}

# Memory Usage
${memory.stdout}

# Disk Usage
${disk.stdout}

# Top Processes
${processes.stdout}
\`\`\``;
                
                await message.reply({
                    content: systemInfo,
                    allowedMentions: { repliedUser: false }
                });
            } catch (error) {
                await message.reply(`❌ Failed to get system info: ${error.message}`);
            }
            return;
        }
        
        // Help command
        if (command === 'help' || command === 'commands') {
            const helpEmbed = new Discord.EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🤖 Brindanator Bot Commands')
                .setDescription('Advanced Discord bot with AI and system management capabilities')
                .addFields(
                    {
                        name: '💬 AI Chat',
                        value: 'Just mention me or DM me to chat with Gemini AI!',
                        inline: false
                    },
                    {
                        name: '🔧 Admin Commands',
                        value: `\`${PREFIX}shell <command>\` - Execute shell commands\n\`${PREFIX}system\` - Get system information\n\`${PREFIX}help\` - Show this help`,
                        inline: false
                    },
                    {
                        name: '🌟 Features',
                        value: '• AI-powered responses via Gemini\n• Remote code execution for admins\n• System monitoring and management\n• Cross-platform compatibility',
                        inline: false
                    }
                )
                .setFooter({ text: 'Brindanator Bot - Powered by Gemini AI & RCE.js' })
                .setTimestamp();
            
            await message.reply({ embeds: [helpEmbed] });
            return;
        }
        
        // AI Chat - Default behavior for any other input
        if (content && content.length > 0) {
            await message.channel.sendTyping();
            
            try {
                // Prepare context for AI
                const prompt = `You are Brindanator, an advanced Discord bot with system management capabilities. 
User: ${message.author.username}
Server: ${message.guild ? message.guild.name : 'Direct Message'}
Message: ${content}

Respond as a helpful, intelligent assistant with personality. Keep responses engaging but concise (under 2000 characters).`;
                
                const result = await model.generateContent(prompt);
                const response = result.response;
                let aiResponse = response.text();
                
                // Ensure response isn't too long
                if (aiResponse.length > 1900) {
                    aiResponse = aiResponse.substring(0, 1900) + '...';
                }
                
                await message.reply({
                    content: aiResponse,
                    allowedMentions: { repliedUser: false }
                });
                
            } catch (error) {
                console.error('AI Error:', error);
                await message.reply('🤖 Sorry, I encountered an error processing your request. My AI systems might be temporarily unavailable.');
            }
        }
        
    } catch (error) {
        console.error('Message handling error:', error);
        await message.reply('❌ An unexpected error occurred while processing your message.');
    }
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Login to Discord
if (!BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN environment variable is required!');
    process.exit(1);
}

client.login(BOT_TOKEN).catch((error) => {
    console.error('Failed to login to Discord:', error);
    process.exit(1);
});

// Keep the process alive
process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Health check endpoint for Railway
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            uptime: process.uptime(),
            bot_status: client.readyAt ? 'connected' : 'disconnected',
            guilds: client.guilds.cache.size
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});
