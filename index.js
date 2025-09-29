// Brindanator Bot - Discord Bot with RCE.js and Gemini AI Integration
// References b1nzeex/rce.js for remote code execution functionality

const discord = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const RCE = require('b1nzeex/rce.js');
const fs = require('fs');
const path = require('path');

// Initialize Discord client
const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildMembers
  ]
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Initialize RCE.js
const rce = new RCE({
  timeout: 30000, // 30 second timeout
  maxBuffer: 1024 * 1024, // 1MB buffer
  shell: true
});

// Bot configuration
const config = {
  prefix: '!',
  adminRoles: ['Administrator', 'Moderator'],
  allowedChannels: process.env.ALLOWED_CHANNELS ? process.env.ALLOWED_CHANNELS.split(',') : [],
  rceEnabled: process.env.RCE_ENABLED === 'true'
};

// Command handlers
const commands = {
  help: {
    description: 'Show available commands',
    usage: '!help [command]',
    execute: async (message, args) => {
      if (args.length === 0) {
        const commandList = Object.keys(commands)
          .map(cmd => `\`${config.prefix}${cmd}\` - ${commands[cmd].description}`)
          .join('\n');
        
        const embed = new discord.EmbedBuilder()
          .setTitle('Brindanator Bot Commands')
          .setDescription(commandList)
          .setColor('#0099ff')
          .setFooter({ text: 'Use !help [command] for detailed usage' });
        
        await message.reply({ embeds: [embed] });
      } else {
        const cmd = commands[args[0]];
        if (cmd) {
          const embed = new discord.EmbedBuilder()
            .setTitle(`Command: ${config.prefix}${args[0]}`)
            .setDescription(cmd.description)
            .addFields({ name: 'Usage', value: cmd.usage })
            .setColor('#0099ff');
          
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply('Command not found!');
        }
      }
    }
  },

  ai: {
    description: 'Chat with Gemini AI',
    usage: '!ai <your question>',
    execute: async (message, args) => {
      if (args.length === 0) {
        await message.reply('Please provide a question for the AI!');
        return;
      }

      try {
        const prompt = args.join(' ');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Split long responses into chunks
        const chunks = text.match(/[\s\S]{1,2000}/g) || [text];
        
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } catch (error) {
        console.error('AI Error:', error);
        await message.reply('Sorry, I encountered an error while processing your request.');
      }
    }
  },

  rce: {
    description: 'Execute system commands (Admin only)',
    usage: '!rce <command>',
    execute: async (message, args) => {
      // Check permissions
      if (!hasAdminPermissions(message.member)) {
        await message.reply('❌ You need administrator permissions to use this command.');
        return;
      }

      if (!config.rceEnabled) {
        await message.reply('❌ RCE functionality is disabled.');
        return;
      }

      if (args.length === 0) {
        await message.reply('Please provide a command to execute!');
        return;
      }

      try {
        const command = args.join(' ');
        const result = await rce.execute(command);
        
        const output = result.stdout || result.stderr || 'Command executed successfully';
        
        // Split output into chunks if too long
        const chunks = output.match(/[\s\S]{1,1900}/g) || [output];
        
        for (const chunk of chunks) {
          const embed = new discord.EmbedBuilder()
            .setTitle('Command Execution Result')
            .setDescription(`\`\`\`\n${chunk}\n\`\`\``)
            .setColor(result.stderr ? '#ff0000' : '#00ff00')
            .setFooter({ text: `Exit code: ${result.code || 0}` });
          
          await message.reply({ embeds: [embed] });
        }
      } catch (error) {
        console.error('RCE Error:', error);
        const embed = new discord.EmbedBuilder()
          .setTitle('Command Execution Error')
          .setDescription(`\`\`\`\n${error.message}\n\`\`\``)
          .setColor('#ff0000');
        
        await message.reply({ embeds: [embed] });
      }
    }
  },

  status: {
    description: 'Show bot status and system information',
    usage: '!status',
    execute: async (message, args) => {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      
      const embed = new discord.EmbedBuilder()
        .setTitle('Brindanator Bot Status')
        .addFields(
          { name: '🟢 Uptime', value: formatUptime(uptime), inline: true },
          { name: '💾 Memory Usage', value: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`, inline: true },
          { name: '🔧 Node.js Version', value: process.version, inline: true },
          { name: '🤖 Discord.js Version', value: discord.version, inline: true },
          { name: '🧠 AI Model', value: 'Gemini Pro', inline: true },
          { name: '⚙️ RCE Status', value: config.rceEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
        )
        .setColor('#00ff00')
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
    }
  },

  ping: {
    description: 'Check bot latency',
    usage: '!ping',
    execute: async (message, args) => {
      const sent = await message.reply('Pinging...');
      const latency = sent.createdTimestamp - message.createdTimestamp;
      const apiLatency = Math.round(client.ws.ping);
      
      const embed = new discord.EmbedBuilder()
        .setTitle('🏓 Pong!')
        .addFields(
          { name: 'Bot Latency', value: `${latency}ms`, inline: true },
          { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
        )
        .setColor('#00ff00');
      
      await sent.edit({ content: '', embeds: [embed] });
    }
  }
};

// Utility functions
function hasAdminPermissions(member) {
  if (!member) return false;
  return member.permissions.has(discord.PermissionsBitField.Flags.Administrator) ||
    config.adminRoles.some(role => member.roles.cache.find(r => r.name === role));
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function isAllowedChannel(channelId) {
  return config.allowedChannels.length === 0 || config.allowedChannels.includes(channelId);
}

// Event handlers
client.once('ready', () => {
  console.log(`✅ Brindanator Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`🔗 RCE.js integration: ${config.rceEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`🧠 Gemini AI integration: ${process.env.GEMINI_API_KEY ? 'Enabled' : 'Disabled'}`);
  
  // Set bot status
  client.user.setActivity('Monitoring systems | !help', { type: discord.ActivityType.Watching });
});

client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Check if message is in allowed channel
  if (!isAllowedChannel(message.channel.id)) return;
  
  // Check if message starts with prefix
  if (!message.content.startsWith(config.prefix)) return;
  
  // Parse command and arguments
  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  // Check if command exists
  const command = commands[commandName];
  if (!command) {
    await message.reply(`❌ Unknown command. Use \`${config.prefix}help\` to see available commands.`);
    return;
  }
  
  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await message.reply('❌ An error occurred while executing the command.');
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Start the bot
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ Missing DISCORD_BOT_TOKEN environment variable');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️  Missing GEMINI_API_KEY environment variable - AI features will be disabled');
}

client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});

// Export for module usage
module.exports = { client, commands, config };
