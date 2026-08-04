require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials, Collection,
  REST, Routes, Events,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType,
} = require('discord.js');

const Database = require('better-sqlite3');
const path = require('path');

// ══════════════════════════════════════════════════════════════════════════════
//  BANCO DE DADOS
// ══════════════════════════════════════════════════════════════════════════════

const db = new Database(path.join(__dirname, 'vkbot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS economia (
    user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
    coins INTEGER DEFAULT 0, inventario TEXT DEFAULT '[]',
    PRIMARY KEY (user_id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS social (
    user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
    nivel INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, reputacao INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS avaliacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT, to_id TEXT, guild_id TEXT,
    nota INTEGER, comentario TEXT DEFAULT '',
    criado_em INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, nome TEXT, descricao TEXT DEFAULT '',
    preco INTEGER, quantidade INTEGER DEFAULT 0, imagem TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS config_stock (guild_id TEXT PRIMARY KEY, canal_id TEXT DEFAULT '');
  CREATE TABLE IF NOT EXISTS pagamento (
    guild_id TEXT PRIMARY KEY, tipo TEXT DEFAULT '',
    chave TEXT DEFAULT '', instrucoes TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT, canal_id TEXT, user_id TEXT,
    assunto TEXT DEFAULT 'Sem assunto', assumido_por TEXT DEFAULT '',
    status TEXT DEFAULT 'aberto',
    criado_em INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS config_ticket (
    guild_id TEXT PRIMARY KEY,
    categoria_id TEXT DEFAULT '', canal_log TEXT DEFAULT '',
    cargo_suporte TEXT DEFAULT '',
    mensagem TEXT DEFAULT 'Clique no botão abaixo para abrir um ticket.'
  );
`);

// ── Helpers de banco ──────────────────────────────────────────────────────────
function getEco(uid, gid) {
  db.prepare('INSERT OR IGNORE INTO economia (user_id, guild_id) VALUES (?,?)').run(uid, gid);
  const r = db.prepare('SELECT * FROM economia WHERE user_id=? AND guild_id=?').get(uid, gid);
  r.inventario = JSON.parse(r.inventario || '[]');
  return r;
}
function addCoins(uid, gid, n)    { db.prepare('INSERT OR IGNORE INTO economia (user_id,guild_id) VALUES(?,?)').run(uid,gid); db.prepare('UPDATE economia SET coins=coins+? WHERE user_id=? AND guild_id=?').run(n,uid,gid); }
function removeCoins(uid, gid, n) { db.prepare('INSERT OR IGNORE INTO economia (user_id,guild_id) VALUES(?,?)').run(uid,gid); db.prepare('UPDATE economia SET coins=MAX(0,coins-?) WHERE user_id=? AND guild_id=?').run(n,uid,gid); }
function addItem(uid, gid, item)  { const e=getEco(uid,gid); e.inventario.push(item); db.prepare('UPDATE economia SET inventario=? WHERE user_id=? AND guild_id=?').run(JSON.stringify(e.inventario),uid,gid); }

function getSocial(uid, gid) {
  db.prepare('INSERT OR IGNORE INTO social (user_id, guild_id) VALUES (?,?)').run(uid, gid);
  return db.prepare('SELECT * FROM social WHERE user_id=? AND guild_id=?').get(uid, gid);
}
function addXp(uid, gid, xp) {
  db.prepare('INSERT OR IGNORE INTO social (user_id,guild_id) VALUES(?,?)').run(uid,gid);
  db.prepare('UPDATE social SET xp=xp+? WHERE user_id=? AND guild_id=?').run(xp,uid,gid);
  const r = getSocial(uid,gid);
  if (r.xp >= r.nivel * 100) { db.prepare('UPDATE social SET nivel=nivel+1,xp=0 WHERE user_id=? AND guild_id=?').run(uid,gid); return true; }
  return false;
}
function addRep(uid, gid, n) { db.prepare('INSERT OR IGNORE INTO social(user_id,guild_id)VALUES(?,?)').run(uid,gid); db.prepare('UPDATE social SET reputacao=reputacao+? WHERE user_id=? AND guild_id=?').run(n,uid,gid); }

function getStock(gid)        { return db.prepare('SELECT * FROM stock WHERE guild_id=?').all(gid); }
function getStockItem(id, gid){ return db.prepare('SELECT * FROM stock WHERE id=? AND guild_id=?').get(id,gid); }

function getConfigTicket(gid) {
  db.prepare('INSERT OR IGNORE INTO config_ticket (guild_id) VALUES (?)').run(gid);
  return db.prepare('SELECT * FROM config_ticket WHERE guild_id=?').get(gid);
}
function getTicketByCanal(cid) { return db.prepare('SELECT * FROM tickets WHERE canal_id=? AND status="aberto"').get(cid); }

// ══════════════════════════════════════════════════════════════════════════════
//  COMANDOS
// ══════════════════════════════════════════════════════════════════════════════

const commands = [

  // ── GERAIS ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Verifica a latência do bot'),
    async execute(i) {
      const s = await i.reply({ content: '🏓 Calculando...', fetchReply: true });
      await i.editReply({ content: null, embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏓 Pong!')
        .addFields({ name: 'Bot', value: `\`${s.createdTimestamp - i.createdTimestamp}ms\``, inline: true },
                   { name: 'API', value: `\`${Math.round(i.client.ws.ping)}ms\``, inline: true })] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('ajuda').setDescription('Lista todos os comandos'),
    async execute(i) {
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Comandos disponíveis')
        .addFields(
          { name: '✨ Gerais',    value: '`/ping` • `/ajuda` • `/info` • `/servidor` • `/oi` • `/dado` • `/cara-ou-coroa`' },
          { name: '💰 Economia',  value: '`/carteira` • `/loja` • `/comprar` • `/inventario` • `/transferir` • `/saldo-top` • `/dar-coins`' },
          { name: '📊 Social',    value: '`/perfil` • `/nivel` • `/avaliar` • `/avaliacoes` • `/reputacao`' },
          { name: '📦 Stock',     value: '`/stock` • `/addstock` • `/editstock` • `/removestock` • `/setcanal-stock`' },
          { name: '💳 Pagamento', value: '`/pagamento` • `/configurarpagamento`' },
          { name: '🎫 Tickets',   value: '`/ticket` • `/fecharticket` • `/assumirticket` • `/adicionarticket` • `/painel-ticket` • `/configurarticket`' },
        ).setFooter({ text: 'Bot sempre online 24/7 🟢' })] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('info').setDescription('Informações sobre o bot'),
    async execute(i) {
      const c = i.client;
      const fmt = ms => { const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24); return `${d}d ${h%24}h ${m%60}m`; };
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('ℹ️ Informações do Bot')
        .setThumbnail(c.user.displayAvatarURL())
        .addFields(
          { name: 'Nome',       value: c.user.username, inline: true },
          { name: 'Servidores', value: `${c.guilds.cache.size}`, inline: true },
          { name: 'Usuários',   value: `${c.users.cache.size}`, inline: true },
          { name: 'Node',       value: process.version, inline: true },
          { name: 'Uptime',     value: fmt(c.uptime), inline: true },
        ).setTimestamp()] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('servidor').setDescription('Informações sobre o servidor'),
    async execute(i) {
      const g = i.guild;
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🏠 ${g.name}`)
        .setThumbnail(g.iconURL())
        .addFields(
          { name: 'Dono',      value: `<@${g.ownerId}>`, inline: true },
          { name: 'Membros',   value: `${g.memberCount}`, inline: true },
          { name: 'Canais',    value: `${g.channels.cache.size}`, inline: true },
          { name: 'Cargos',    value: `${g.roles.cache.size}`, inline: true },
          { name: 'Criado em', value: `<t:${Math.floor(g.createdTimestamp/1000)}:D>`, inline: true },
        ).setTimestamp()] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('oi').setDescription('O bot te saúda!'),
    async execute(i) {
      const msgs = [`Olá, ${i.user.username}! 👋`, `Oi ${i.user.username}! Tudo bem? 😊`, `E aí ${i.user.username}! 🎉`, `Opa, ${i.user.username}! Seja bem-vindo! ✨`];
      await i.reply(msgs[Math.floor(Math.random() * msgs.length)]);
    },
  },

  {
    data: new SlashCommandBuilder().setName('dado').setDescription('Rola um dado')
      .addIntegerOption(o => o.setName('lados').setDescription('Lados do dado (padrão 6)').setMinValue(2).setMaxValue(100)),
    async execute(i) {
      const l = i.options.getInteger('lados') ?? 6;
      await i.reply(`🎲 Dado de **${l}** lados: **${Math.floor(Math.random()*l)+1}**!`);
    },
  },

  {
    data: new SlashCommandBuilder().setName('cara-ou-coroa').setDescription('Joga cara ou coroa'),
    async execute(i) { await i.reply(Math.random() < 0.5 ? '🪙 **Cara**!' : '🔵 **Coroa**!'); },
  },

  // ── ECONOMIA ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('carteira').setDescription('Veja seu saldo')
      .addUserOption(o => o.setName('usuario').setDescription('Ver carteira de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const e = getEco(u.id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(`💰 Carteira de ${u.username}`)
        .setThumbnail(u.displayAvatarURL())
        .addFields({ name: 'Saldo', value: `**${e.coins.toLocaleString('pt-BR')} coins**` })] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('loja').setDescription('Itens disponíveis na loja'),
    async execute(i) {
      const itens = getStock(i.guildId).filter(x => x.quantidade > 0);
      if (!itens.length) return i.reply({ content: '🛒 Loja vazia no momento.', ephemeral: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('🛒 Loja do Servidor')
        .setDescription(itens.map(x => `**ID ${x.id} — ${x.nome}**\n💰 ${x.preco} coins | 📦 ${x.quantidade} disponíveis\n${x.descricao||''}`).join('\n\n'))] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('comprar').setDescription('Compra um item da loja')
      .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade (padrão 1)').setMinValue(1)),
    async execute(i) {
      const id  = i.options.getInteger('id');
      const qtd = i.options.getInteger('quantidade') ?? 1;
      const item = getStockItem(id, i.guildId);
      if (!item) return i.reply({ content: '❌ Item não encontrado.', ephemeral: true });
      if (item.quantidade < qtd) return i.reply({ content: `❌ Estoque insuficiente. Disponível: **${item.quantidade}**.`, ephemeral: true });
      const eco   = getEco(i.user.id, i.guildId);
      const total = item.preco * qtd;
      if (eco.coins < total) return i.reply({ content: `❌ Coins insuficientes. Você tem **${eco.coins}**, precisa de **${total}**.`, ephemeral: true });
      removeCoins(i.user.id, i.guildId, total);
      db.prepare('UPDATE stock SET quantidade=quantidade-? WHERE id=? AND guild_id=?').run(qtd, id, i.guildId);
      for (let k = 0; k < qtd; k++) addItem(i.user.id, i.guildId, { id, nome: item.nome, preco: item.preco });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ Compra realizada!')
        .setDescription(`Você comprou **${qtd}x ${item.nome}** por **${total} coins**.`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('inventario').setDescription('Veja seu inventário')
      .addUserOption(o => o.setName('usuario').setDescription('Ver inventário de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const inv = getEco(u.id, i.guildId).inventario;
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle(`🎒 Inventário de ${u.username}`)
        .setDescription(inv.length ? inv.map((it,k)=>`${k+1}. **${it.nome}** — ${it.preco} coins`).join('\n') : 'Inventário vazio.')] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('transferir').setDescription('Transfere coins para outro membro')
      .addUserOption(o => o.setName('usuario').setDescription('Destinatário').setRequired(true))
      .addIntegerOption(o => o.setName('valor').setDescription('Quantidade').setRequired(true).setMinValue(1)),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const v = i.options.getInteger('valor');
      if (u.id === i.user.id) return i.reply({ content: '❌ Você não pode transferir para si mesmo.', ephemeral: true });
      if (u.bot) return i.reply({ content: '❌ Você não pode transferir para bots.', ephemeral: true });
      const eco = getEco(i.user.id, i.guildId);
      if (eco.coins < v) return i.reply({ content: `❌ Saldo insuficiente. Você tem **${eco.coins} coins**.`, ephemeral: true });
      removeCoins(i.user.id, i.guildId, v);
      addCoins(u.id, i.guildId, v);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('💸 Transferência realizada!')
        .setDescription(`**${i.user.username}** transferiu **${v} coins** para **${u.username}**.`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('saldo-top').setDescription('Ranking de coins do servidor'),
    async execute(i) {
      const top = db.prepare('SELECT * FROM economia WHERE guild_id=? ORDER BY coins DESC LIMIT 10').all(i.guildId);
      if (!top.length) return i.reply({ content: '📊 Sem dados ainda.', ephemeral: true });
      const m = ['🥇','🥈','🥉'];
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('🏆 Top Coins do Servidor')
        .setDescription(top.map((r,k)=>`${m[k]??`**${k+1}.**`} <@${r.user_id}> — **${r.coins.toLocaleString('pt-BR')} coins**`).join('\n'))] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('dar-coins').setDescription('(Admin) Dá coins para um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário alvo').setRequired(true))
      .addIntegerOption(o => o.setName('valor').setDescription('Quantidade').setRequired(true).setMinValue(1))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const v = i.options.getInteger('valor');
      addCoins(u.id, i.guildId, v);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`✅ **${v} coins** adicionados para ${u}.`)] });
    },
  },

  // ── SOCIAL ───────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('perfil').setDescription('Veja seu perfil')
      .addUserOption(o => o.setName('usuario').setDescription('Ver perfil de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const s = getSocial(u.id, i.guildId);
      const e = getEco(u.id, i.guildId);
      const avs = db.prepare('SELECT * FROM avaliacoes WHERE to_id=? AND guild_id=?').all(u.id, i.guildId);
      const media = avs.length ? (avs.reduce((a,b)=>a+b.nota,0)/avs.length).toFixed(1) : 'Sem avaliações';
      const xpN   = s.nivel * 100;
      const prog  = Math.min(Math.floor((s.xp/xpN)*10),10);
      const barra = '█'.repeat(prog) + '░'.repeat(10-prog);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`👤 Perfil de ${u.username}`)
        .setThumbnail(u.displayAvatarURL())
        .addFields(
          { name: '⭐ Nível',     value: `${s.nivel}`, inline: true },
          { name: '✨ XP',        value: `${s.xp}/${xpN}`, inline: true },
          { name: '🌟 Reputação', value: `${s.reputacao}`, inline: true },
          { name: '💰 Coins',     value: `${e.coins.toLocaleString('pt
