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
          { name: '💰 Coins',     value: `${e.coins.toLocaleString('pt-BR')} coins`, inline: true },
          { name: '⭐ Avaliação', value: `${media}`, inline: true },
          { name: '📊 Progresso', value: `[${barra}] ${s.xp}/${xpN}` },
        )] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('nivel').setDescription('Veja seu nível e XP')
      .addUserOption(o => o.setName('usuario').setDescription('Ver nível de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const s = getSocial(u.id, i.guildId);
      const xpN  = s.nivel * 100;
      const prog = Math.min(Math.floor((s.xp/xpN)*10),10);
      const barra = '█'.repeat(prog) + '░'.repeat(10-prog);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle(`📊 Nível de ${u.username}`)
        .addFields(
          { name: 'Nível', value: `**${s.nivel}**`, inline: true },
          { name: 'XP',    value: `**${s.xp}/${xpN}**`, inline: true },
          { name: 'Progresso', value: `[${barra}]` },
        )] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('avaliar').setDescription('Avalia um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Membro a avaliar').setRequired(true))
      .addIntegerOption(o => o.setName('nota').setDescription('Nota de 1 a 5').setRequired(true).setMinValue(1).setMaxValue(5))
      .addStringOption(o => o.setName('comentario').setDescription('Comentário opcional')),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const n = i.options.getInteger('nota');
      const c = i.options.getString('comentario') ?? '';
      if (u.id === i.user.id) return i.reply({ content: '❌ Você não pode se avaliar.', ephemeral: true });
      if (u.bot) return i.reply({ content: '❌ Você não pode avaliar bots.', ephemeral: true });
      db.prepare('INSERT INTO avaliacoes (from_id,to_id,guild_id,nota,comentario) VALUES (?,?,?,?,?)').run(i.user.id, u.id, i.guildId, n, c);
      addRep(u.id, i.guildId, n >= 4 ? 1 : n <= 2 ? -1 : 0);
      const estrelas = '⭐'.repeat(n) + '☆'.repeat(5-n);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle('⭐ Avaliação registrada!')
        .setDescription(`**${i.user.username}** avaliou **${u.username}** com ${estrelas}\n${c ? `> ${c}` : ''}`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('avaliacoes').setDescription('Veja as avaliações de um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Membro').setRequired(true)),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const avs = db.prepare('SELECT * FROM avaliacoes WHERE to_id=? AND guild_id=? ORDER BY criado_em DESC LIMIT 10').all(u.id, i.guildId);
      if (!avs.length) return i.reply({ content: `📊 **${u.username}** ainda não recebeu avaliações.`, ephemeral: true });
      const media = (avs.reduce((a,b)=>a+b.nota,0)/avs.length).toFixed(1);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle(`⭐ Avaliações de ${u.username}`)
        .setDescription(`Média: **${media}/5** (${avs.length} avaliações)\n\n` +
          avs.map(a=>`${'⭐'.repeat(a.nota)} — <@${a.from_id}>${a.comentario?`\n> ${a.comentario}`:''}`).join('\n'))] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('reputacao').setDescription('Ranking de reputação do servidor'),
    async execute(i) {
      const top = db.prepare('SELECT * FROM social WHERE guild_id=? ORDER BY reputacao DESC LIMIT 10').all(i.guildId);
      if (!top.length) return i.reply({ content: '📊 Sem dados ainda.', ephemeral: true });
      const m = ['🥇','🥈','🥉'];
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🌟 Top Reputação do Servidor')
        .setDescription(top.map((r,k)=>`${m[k]??`**${k+1}.**`} <@${r.user_id}> — **${r.reputacao} rep**`).join('\n'))] });
    },
  },

  // ── STOCK ────────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('stock').setDescription('(Admin) Lista todos os itens do stock')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const itens = getStock(i.guildId);
      if (!itens.length) return i.reply({ content: '📦 Nenhum item no stock.', ephemeral: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x1ABC9C).setTitle('📦 Stock do Servidor')
        .setDescription(itens.map(x=>`**ID ${x.id} — ${x.nome}**\n💰 ${x.preco} coins | 📦 ${x.quantidade} un.\n${x.descricao||'Sem descrição'}`).join('\n\n'))] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('addstock').setDescription('(Admin) Adiciona item ao stock')
      .addStringOption(o => o.setName('nome').setDescription('Nome do item').setRequired(true))
      .addIntegerOption(o => o.setName('preco').setDescription('Preço em coins').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('descricao').setDescription('Descrição do item'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const nome  = i.options.getString('nome');
      const preco = i.options.getInteger('preco');
      const qtd   = i.options.getInteger('quantidade');
      const desc  = i.options.getString('descricao') ?? '';
      db.prepare('INSERT INTO stock (guild_id,nome,descricao,preco,quantidade) VALUES (?,?,?,?,?)').run(i.guildId,nome,desc,preco,qtd);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`✅ **${nome}** adicionado ao stock!\n💰 ${preco} coins | 📦 ${qtd} unidades`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('editstock').setDescription('(Admin) Edita um item do stock')
      .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
      .addStringOption(o => o.setName('nome').setDescription('Novo nome'))
      .addIntegerOption(o => o.setName('preco').setDescription('Novo preço').setMinValue(1))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Nova quantidade').setMinValue(0))
      .addStringOption(o => o.setName('descricao').setDescription('Nova descrição'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const id   = i.options.getInteger('id');
      const item = getStockItem(id, i.guildId);
      if (!item) return i.reply({ content: '❌ Item não encontrado.', ephemeral: true });
      const nome  = i.options.getString('nome') ?? item.nome;
      const preco = i.options.getInteger('preco') ?? item.preco;
      const qtd   = i.options.getInteger('quantidade') ?? item.quantidade;
      const desc  = i.options.getString('descricao') ?? item.descricao;
      db.prepare('UPDATE stock SET nome=?,preco=?,quantidade=?,descricao=? WHERE id=? AND guild_id=?').run(nome,preco,qtd,desc,id,i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription(`✅ Item **${nome}** atualizado!`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('removestock').setDescription('(Admin) Remove item do stock')
      .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const id   = i.options.getInteger('id');
      const item = getStockItem(id, i.guildId);
      if (!item) return i.reply({ content: '❌ Item não encontrado.', ephemeral: true });
      db.prepare('DELETE FROM stock WHERE id=? AND guild_id=?').run(id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`✅ Item **${item.nome}** removido do stock.`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('setcanal-stock').setDescription('(Admin) Define o canal de notificações do stock')
      .addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const canal = i.options.getChannel('canal');
      db.prepare('INSERT OR REPLACE INTO config_stock (guild_id, canal_id) VALUES (?,?)').run(i.guildId, canal.id);
      await i.reply({ content: `✅ Canal de stock definido para ${canal}.`, ephemeral: true });
    },
  },

  // ── PAGAMENTO ────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('pagamento').setDescription('Veja as informações de pagamento do servidor'),
    async execute(i) {
      const p = db.prepare('SELECT * FROM pagamento WHERE guild_id=?').get(i.guildId);
      if (!p || !p.tipo) return i.reply({ content: '💳 Nenhuma forma de pagamento configurada.', ephemeral: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x27AE60).setTitle('💳 Pagamento')
        .addFields(
          { name: 'Tipo',       value: p.tipo,  inline: true },
          { name: 'Chave',      value: p.chave, inline: true },
          { name: 'Instruções', value: p.instrucoes || 'Sem instruções adicionais.' },
        )] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('configurarpagamento').setDescription('(Admin) Configura pagamento do servidor')
      .addStringOption(o => o.setName('tipo').setDescription('Tipo (PIX, PayPal, etc)').setRequired(true))
      .addStringOption(o => o.setName('chave').setDescription('Chave/endereço').setRequired(true))
      .addStringOption(o => o.setName('instrucoes').setDescription('Instruções adicionais'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const tipo  = i.options.getString('tipo');
      const chave = i.options.getString('chave');
      const inst  = i.options.getString('instrucoes') ?? '';
      db.prepare('INSERT OR REPLACE INTO pagamento (guild_id,tipo,chave,instrucoes) VALUES (?,?,?,?)').run(i.guildId,tipo,chave,inst);
      await i.reply({ content: `✅ Pagamento configurado: **${tipo}** — \`${chave}\``, ephemeral: true });
    },
  },

  // ── TICKETS ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder().setName('ticket').setDescription('Abre um novo ticket de suporte')
      .addStringOption(o => o.setName('assunto').setDescription('Assunto do ticket').setRequired(true)),
    async execute(i) {
      const cfg     = getConfigTicket(i.guildId);
      const assunto = i.options.getString('assunto');
      const categoria = cfg.categoria_id ? i.guild.channels.cache.get(cfg.categoria_id) : null;
      const canal = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        parent: categoria?.id ?? null,
        permissionOverwrites: [
          { id: i.guild.id,  deny: ['ViewChannel'] },
          { id: i.user.id,   allow: ['ViewChannel','SendMessages','ReadMessageHistory'] },
          ...(cfg.cargo_suporte ? [{ id: cfg.cargo_suporte, allow: ['ViewChannel','SendMessages','ReadMessageHistory'] }] : []),
        ],
      });
      db.prepare('INSERT INTO tickets (guild_id,canal_id,user_id,assunto) VALUES (?,?,?,?)').run(i.guildId, canal.id, i.user.id, assunto);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('assumir_ticket').setLabel('✋ Assumir').setStyle(ButtonStyle.Primary),
      );
      await canal.send({
        content: `<@${i.user.id}>${cfg.cargo_suporte ? ` | <@&${cfg.cargo_suporte}>` : ''}`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket')
          .addFields({ name: 'Assunto', value: assunto }, { name: 'Aberto por', value: `<@${i.user.id}>` })
          .setTimestamp()],
        components: [row],
      });
      await i.reply({ content: `✅ Ticket aberto em ${canal}!`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder().setName('fecharticket').setDescription('Fecha o ticket do canal atual'),
    async execute(i) {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
      db.prepare('UPDATE tickets SET status="fechado" WHERE canal_id=?').run(i.channelId);
      const cfg = getConfigTicket(i.guildId);
      if (cfg.canal_log) {
        const logCh = i.guild.channels.cache.get(cfg.canal_log);
        if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🎫 Ticket Fechado')
          .addFields({ name: 'Assunto', value: t.assunto }, { name: 'Aberto por', value: `<@${t.user_id}>` },
                     { name: 'Fechado por', value: `<@${i.user.id}>` }).setTimestamp()] });
      }
      await i.reply('🔒 Ticket será fechado em 5 segundos...');
      setTimeout(() => i.channel.delete().catch(()=>{}), 5000);
    },
  },

  {
    data: new SlashCommandBuilder().setName('assumirticket').setDescription('Assume o ticket do canal atual'),
    async execute(i) {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
      db.prepare('UPDATE tickets SET assumido_por=? WHERE canal_id=?').run(i.user.id, i.channelId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`✋ **${i.user.username}** assumiu este ticket.`)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('adicionarticket').setDescription('Adiciona membro ao ticket atual')
      .addUserOption(o => o.setName('usuario').setDescription('Membro a adicionar').setRequired(true)),
    async execute(i) {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
      const u = i.options.getUser('usuario');
      await i.channel.permissionOverwrites.create(u.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await i.reply({ content: `✅ ${u} foi adicionado ao ticket.` });
    },
  },

  {
    data: new SlashCommandBuilder().setName('painel-ticket').setDescription('(Admin) Envia o painel de abertura de tickets')
      .addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar o painel').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const cfg   = getConfigTicket(i.guildId);
      const canal = i.options.getChannel('canal');
      const row   = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('abrir_ticket').setLabel('🎫 Abrir Ticket').setStyle(ButtonStyle.Primary),
      );
      await canal.send({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Suporte')
          .setDescription(cfg.mensagem || 'Clique no botão abaixo para abrir um ticket.')],
        components: [row],
      });
      await i.reply({ content: `✅ Painel enviado em ${canal}!`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder().setName('configurarticket').setDescription('(Admin) Configura o sistema de tickets')
      .addChannelOption(o => o.setName('categoria').setDescription('Categoria para criar os tickets'))
      .addChannelOption(o => o.setName('log').setDescription('Canal de logs dos tickets'))
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo de suporte'))
      .addStringOption(o => o.setName('mensagem').setDescription('Mensagem do painel de tickets'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const cat  = i.options.getChannel('categoria');
      const log  = i.options.getChannel('log');
      const role = i.options.getRole('cargo');
      const msg  = i.options.getString('mensagem');
      const cfg  = getConfigTicket(i.guildId);
      db.prepare('UPDATE config_ticket SET categoria_id=?,canal_log=?,cargo_suporte=?,mensagem=? WHERE guild_id=?')
        .run(cat?.id??cfg.categoria_id, log?.id??cfg.canal_log, role?.id??cfg.cargo_suporte, msg??cfg.mensagem, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ Configuração de Tickets Atualizada')
        .addFields(
          { name: 'Categoria', value: cat ? `<#${cat.id}>` : cfg.categoria_id||'Não definida', inline: true },
          { name: 'Log',       value: log ? `<#${log.id}>` : cfg.canal_log||'Não definido',    inline: true },
          { name: 'Cargo',     value: role ? `<@&${role.id}>` : cfg.cargo_suporte||'Não definido', inline: true },
        )], ephemeral: true });
    },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  CLIENTE DISCORD
// ══════════════════════════════════════════════════════════════════════════════

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

// ── Registrar comandos quando o bot ficar online ──────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online como ${c.user.tag}`);
  try {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: commands.map(cmd => cmd.data.toJSON()),
    });
    console.log(`✅ ${commands.length} comandos slash registrados com sucesso!`);
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err);
  }
});

// ── Interações: slash commands + botões + modals ──────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // Slash commands
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`❌ Erro no comando /${interaction.commandName}:`, err);
      const msg = { content: '❌ Ocorreu um erro ao executar este comando.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(()=>{});
      else await interaction.reply(msg).catch(()=>{});
    }
    return;
  }

  // Botões
  if (interaction.isButton()) {
    // Abrir ticket via painel
    if (interaction.customId === 'abrir_ticket') {
      const modal = new ModalBuilder().setCustomId('modal_ticket').setTitle('Abrir Ticket');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('assunto_input').setLabel('Qual é o seu assunto?')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
        ),
      );
      return interaction.showModal(modal);
    }

    // Fechar ticket via botão
    if (interaction.customId === 'fechar_ticket') {
      const t = getTicketByCanal(interaction.channelId);
      if (!t) return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
      db.prepare('UPDATE tickets SET status="fechado" WHERE canal_id=?').run(interaction.channelId);
      const cfg = getConfigTicket(interaction.guildId);
      if (cfg.canal_log) {
        const logCh = interaction.guild.channels.cache.get(cfg.canal_log);
        if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🎫 Ticket Fechado')
          .addFields({ name: 'Assunto', value: t.assunto }, { name: 'Aberto por', value: `<@${t.user_id}>` },
                     { name: 'Fechado por', value: `<@${interaction.user.id}>` }).setTimestamp()] });
      }
      await interaction.reply('🔒 Ticket será fechado em 5 segundos...');
      setTimeout(() => interaction.channel.delete().catch(()=>{}), 5000);
      return;
    }

    // Assumir ticket via botão
    if (interaction.customId === 'assumir_ticket') {
      const t = getTicketByCanal(interaction.channelId);
      if (!t) return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
      db.prepare('UPDATE tickets SET assumido_por=? WHERE canal_id=?').run(interaction.user.id, interaction.channelId);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71)
        .setDescription(`✋ **${interaction.user.username}** assumiu este ticket.`)] });
    }
  }

  // Modal: abrir ticket via painel
  if (interaction.isModalSubmit() && interaction.customId === 'modal_ticket') {
    const assunto = interaction.fields.getTextInputValue('assunto_input');
    const cfg = getConfigTicket(interaction.guildId);
    const categoria = cfg.categoria_id ? interaction.guild.channels.cache.get(cfg.categoria_id) : null;
    try {
      const canal = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: categoria?.id ?? null,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: ['ViewChannel'] },
          { id: interaction.user.id,  allow: ['ViewChannel','SendMessages','ReadMessageHistory'] },
          ...(cfg.cargo_suporte ? [{ id: cfg.cargo_suporte, allow: ['ViewChannel','SendMessages','ReadMessageHistory'] }] : []),
        ],
      });
      db.prepare('INSERT INTO tickets (guild_id,canal_id,user_id,assunto) VALUES (?,?,?,?)').run(interaction.guildId, canal.id, interaction.user.id, assunto);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('assumir_ticket').setLabel('✋ Assumir').setStyle(ButtonStyle.Primary),
      );
      await canal.send({
        content: `<@${interaction.user.id}>${cfg.cargo_suporte ? ` | <@&${cfg.cargo_suporte}>` : ''}`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎫 Ticket')
          .addFields({ name: 'Assunto', value: assunto }, { name: 'Aberto por', value: `<@${interaction.user.id}>` })
          .setTimestamp()],
        components: [row],
      });
      await interaction.reply({ content: `✅ Ticket aberto em ${canal}!`, ephemeral: true });
    } catch (err) {
      console.error('❌ Erro ao criar ticket:', err);
      await interaction.reply({ content: '❌ Erro ao criar o ticket. Verifique as permissões do bot.', ephemeral: true });
    }
  }
});

// ── XP por mensagem ───────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const levelUp = addXp(msg.author.id, msg.guild.id, Math.floor(Math.random() * 10) + 5);
  if (levelUp) {
    const s = getSocial(msg.author.id, msg.guild.id);
    await msg.channel.send(`🎉 Parabéns ${msg.author}! Você subiu para o **nível ${s.nivel}**! 🎊`).catch(()=>{});
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('❌ DISCORD_TOKEN não definido!'); process.exit(1); }
client.login(token).catch(err => { console.error('❌ Falha ao conectar:', err.message); process.exit(1); });
