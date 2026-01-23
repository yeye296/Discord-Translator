const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 25572;

// 配置文件路径
const CONFIG_FILE = './.npm/sub.txt';

// 生成随机密码
function generateRandomPassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// 生成示例 Discord Token 格式
function generateExampleToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const part1 = Buffer.from(Math.random().toString()).toString('base64').substring(0, 24);
  const part2 = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part3 = Array.from({length: 27}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part1}.${part2}.${part3}`;
}

// 默认配置
let config = {
  adminPassword: generateRandomPassword(16),
  discordToken: generateExampleToken(),
  translateApiUrl: 'https://libretranslate.com',
  translateApiKey: '',
  botStatus: 'offline',
  commandPrefix: '!',
  supportedLanguages: ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru']
};

// 读取配置文件
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const lines = data.split('\n');
      lines.forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          if (key === 'supportedLanguages') {
            config[key] = value.split(',').map(lang => lang.trim());
          } else {
            config[key] = value;
          }
        }
      });
      console.log('✅ 配置文件加载成功');
    } else {
      // 首次启动，生成新的随机密码和示例 Token
      console.log('📝 首次启动，生成新配置文件');
      console.log('🔑 生成的管理员密码:', config.adminPassword);
      console.log('🎫 生成的示例 Token:', config.discordToken);
      saveConfig();
    }
  } catch (error) {
    console.error('❌ 配置文件读取失败:', error.message);
  }
}

// 保存配置文件
function saveConfig() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const configText = [
      `adminPassword=${config.adminPassword}`,
      `discordToken=${config.discordToken}`,
      `translateApiUrl=${config.translateApiUrl}`,
      `translateApiKey=${config.translateApiKey}`,
      `botStatus=${config.botStatus}`,
      `commandPrefix=${config.commandPrefix}`,
      `supportedLanguages=${config.supportedLanguages.join(',')}`
    ].join('\n');
    
    fs.writeFileSync(CONFIG_FILE, configText, 'utf8');
    console.log('💾 配置已保存');
  } catch (error) {
    console.error('❌ 配置文件保存失败:', error.message);
  }
}

// 加载配置
loadConfig();

// Express 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'discord-bot-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1小时
}));

// 静态文件服务
app.use(express.static(__dirname));

// Discord 客户端
let client = null;

// 翻译函数
async function translate(text, targetLang = 'zh', sourceLang = 'auto') {
  try {
    const url = `${config.translateApiUrl}/translate`;
    const headers = { 'Content-Type': 'application/json' };
    
    if (config.translateApiKey) {
      headers['Authorization'] = `Bearer ${config.translateApiKey}`;
    }
    
    const response = await axios.post(url, {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    }, { headers });
    
    return response.data.translatedText;
  } catch (error) {
    console.error('翻译错误:', error.message);
    return null;
  }
}

// 检测语言
async function detectLanguage(text) {
  try {
    const url = `${config.translateApiUrl}/detect`;
    const response = await axios.post(url, { q: text });
    return response.data[0].language;
  } catch (error) {
    console.error('语言检测错误:', error.message);
    return 'en';
  }
}

// 启动 Discord 机器人
function startBot() {
  if (!config.discordToken) {
    console.log('⚠️  未配置 Discord Token');
    return false;
  }

  try {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once('ready', () => {
      console.log(`✅ 机器人已上线: ${client.user.tag}`);
      config.botStatus = 'online';
      saveConfig();
    });

    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const content = message.content.trim();
      const prefix = config.commandPrefix;

      if (content.startsWith(`${prefix}translate `) || content.startsWith(`${prefix}tr `)) {
        const args = content.slice(content.startsWith(`${prefix}translate `) ? prefix.length + 10 : prefix.length + 3).trim().split(' ');
        
        if (args.length < 2) {
          return message.reply(`❌ 用法: \`${prefix}translate <目标语言> <文本>\``);
        }

        const targetLang = args[0].toLowerCase();
        const textToTranslate = args.slice(1).join(' ');

        message.channel.sendTyping();

        const translatedText = await translate(textToTranslate, targetLang);

        if (translatedText) {
          const detectedLang = await detectLanguage(textToTranslate);
          message.reply({
            embeds: [{
              color: 0x5865F2,
              title: '🌍 翻译结果',
              fields: [
                { name: `原文 (${detectedLang})`, value: textToTranslate, inline: false },
                { name: `译文 (${targetLang})`, value: translatedText, inline: false }
              ],
              footer: { text: 'Translation Bot' },
              timestamp: new Date()
            }]
          });
        } else {
          message.reply('❌ 翻译失败，请稍后再试。');
        }
      }

      if (content === `${prefix}help` || content === `${prefix}翻译帮助`) {
        message.reply({
          embeds: [{
            color: 0x5865F2,
            title: '🤖 翻译机器人使用指南',
            fields: [
              { name: '📌 基本命令', value: `\`${prefix}translate <语言> <文本>\` 或 \`${prefix}tr <语言> <文本>\``, inline: false },
              { name: '🌐 支持语言', value: config.supportedLanguages.join(', '), inline: false },
              { name: '💡 示例', value: `\`${prefix}tr en 你好世界\``, inline: false }
            ]
          }]
        });
      }
    });

    client.login(config.discordToken);
    return true;
  } catch (error) {
    console.error('❌ 机器人启动失败:', error.message);
    config.botStatus = 'error';
    return false;
  }
}

// 停止机器人
function stopBot() {
  if (client) {
    client.destroy();
    client = null;
    config.botStatus = 'offline';
    saveConfig();
    console.log('🛑 机器人已停止');
  }
}

// Web 路由

// 主页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

// API: 检查登录状态
app.get('/api/auth/check', (req, res) => {
  res.json({ isAdmin: req.session.isAdmin || false });
});

// API: 登录
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password === config.adminPassword) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// API: 登出
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// API: 修改密码
app.post('/api/auth/change-password', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false });
  }
  
  const { newPassword } = req.body;
  if (newPassword && newPassword.length >= 6) {
    config.adminPassword = newPassword;
    saveConfig();
    req.session.destroy();
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// API: 获取配置
app.get('/api/config', (req, res) => {
  res.json(config);
});

// API: 保存配置
app.post('/api/config', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false });
  }
  
  const { discordToken, translateApiUrl, translateApiKey, commandPrefix, supportedLanguages } = req.body;
  
  config.discordToken = discordToken || '';
  config.translateApiUrl = translateApiUrl || 'https://libretranslate.com';
  config.translateApiKey = translateApiKey || '';
  config.commandPrefix = commandPrefix || '!';
  config.supportedLanguages = supportedLanguages.split(',').map(lang => lang.trim());
  
  saveConfig();
  res.json({ success: true });
});

// API: 启动机器人
app.post('/api/bot/start', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false });
  }
  
  if (startBot()) {
    res.json({ success: true });
  } else {
    res.json({ success: false, message: '请先配置 Discord Token' });
  }
});

// API: 停止机器人
app.post('/api/bot/stop', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false });
  }
  
  stopBot();
  res.json({ success: true });
});

// 启动 Web 服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       🤖 Discord 翻译机器人管理面板已启动            ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🌐 访问地址: http://node1.wavehost.org:${PORT}`);
  console.log(`🌐 本地访问: http://localhost:${PORT}`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 登录信息（请妥善保管）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   管理员密码: ${config.adminPassword}`);
  console.log(`   示例 Token: ${config.discordToken.substring(0, 30)}...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('💡 提示:');
  console.log('   1. 首次登录请使用上方的管理员密码');
  console.log('   2. 登录后请在面板中填写真实的 Discord Bot Token');
  console.log('   3. 建议在"安全设置"中修改管理员密码');
  console.log('   4. 配置保存在 .npm/sub.txt 文件中');
  console.log('');
  
  // 如果已配置真实 Token（不是示例格式），自动启动机器人
  if (config.discordToken && config.discordToken.length > 50 && !config.discordToken.includes('example') && config.botStatus === 'online') {
    console.log('🚀 检测到配置的 Token，正在启动机器人...');
    startBot();
  }
});