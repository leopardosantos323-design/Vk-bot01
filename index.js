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
    mensagem TEXT DEFAULT 'Clique no botao abaixo para abrir um ticket.'
  );
`);

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

const commands = [
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Verifica a latencia do bot'),
    async execute(i) {
      const s = await i.reply({ content: 'Calculando...', fetchReply: true });
      await i.editReply({ content: null, embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Pong!')
        .addFields({ name: 'Bot', value: `\`${s.createdTimestamp - i.createdTimestamp}ms\``, inline: true },
                   { name: 'API', value: `\`${Math.round(i.client.ws.ping)}ms\``, inline: true })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('ajuda').setDescription('Lista todos os comandos'),
    async execute(i) {
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Comandos disponíveis')
        .addFields(
          { name: 'Gerais',    value: '`/ping` `/ajuda` `/info` `/servidor` `/oi` `/dado` `/cara-ou-coroa`' },
          { name: 'Economia',  value: '`/carteira` `/loja` `/comprar` `/inventario` `/transferir` `/saldo-top` `/dar-coins`' },
          { name: 'Social',    value: '`/perfil` `/nivel` `/avaliar` `/avaliacoes` `/reputacao`' },
          { name: 'Stock',     value: '`/stock` `/addstock` `/editstock` `/removestock` `/setcanal-stock`' },
          { name: 'Pagamento', value: '`/pagamento` `/configurarpagamento`' },
          { name: 'Tickets',   value: '`/ticket` `/fecharticket` `/assumirticket` `/adicionarticket` `/painel-ticket` `/configurarticket`' },
        ).setFooter({ text: 'Bot online 24/7' })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('info').setDescription('Informacoes sobre o bot'),
    async execute(i) {
      const c = i.client;
      const fmt = ms => { const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24); return `${d}d ${h%24}h ${m%60}m`; };
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Informacoes do Bot')
        .setThumbnail(c.user.displayAvatarURL())
        .addFields(
          { name: 'Nome',      value: c.user.username, inline: true },
          { name: 'Servidores',value: `${c.guilds.cache.size}`, inline: true },
          { name: 'Usuarios',  value: `${c.users.cache.size}`, inline: true },
          { name: 'Node',      value: process.version, inline: true },
          { name: 'Uptime',    value: fmt(c.uptime), inline: true },
        ).setTimestamp()] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('servidor').setDescription('Informacoes sobre o servidor'),
    async execute(i) {
      const g = i.guild;
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(g.name)
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
    data: new SlashCommandBuilder().setName('oi').setDescription('O bot te sauda!'),
    async execute(i) {
      const msgs = [`Ola, ${i.user.username}!`, `Oi ${i.user.username}! Tudo bem?`, `E ai ${i.user.username}!`, `Opa, ${i.user.username}! Seja bem-vindo!`];
      await i.reply(msgs[Math.floor(Math.random() * msgs.length)]);
    },
  },
  {
    data: new SlashCommandBuilder().setName('dado').setDescription('Rola um dado')
      .addIntegerOption(o => o.setName('lados').setDescription('Lados do dado (padrao 6)').setMinValue(2).setMaxValue(100)),
    async execute(i) {
      const l = i.options.getInteger('lados') ?? 6;
      await i.reply(`Dado de **${l}** lados: **${Math.floor(Math.random()*l)+1}**!`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('cara-ou-coroa').setDescription('Joga cara ou coroa'),
    async execute(i) { await i.reply(Math.random() < 0.5 ? '**Cara**!' : '**Coroa**!'); },
  },
  {
    data: new SlashCommandBuilder().setName('carteira').setDescription('Veja seu saldo')
      .addUserOption(o => o.setName('usuario').setDescription('Ver carteira de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const e = getEco(u.id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(`Carteira de ${u.username}`)
        .setThumbnail(u.displayAvatarURL())
        .addFields({ name: 'Saldo', value: `**${e.coins} coins**` })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('loja').setDescription('Itens disponíveis na loja'),
    async execute(i) {
      const itens = getStock(i.guildId).filter(x => x.quantidade > 0);
      if (!itens.length) return i.reply({ content: 'Loja vazia no momento.', ephemeral: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('Loja do Servidor')
        .setDescription(itens.map(x => `**ID ${x.id} - ${x.nome}**\n${x.preco} coins | ${x.quantidade} disponíveis\n${x.descricao||''}`).join('\n\n'))] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('comprar').setDescription('Compra um item da loja')
      .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade (padrao 1)').setMinValue(1)),
    async execute(i) {
      const id  = i.options.getInteger('id');
      const qtd = i.options.getInteger('quantidade') ?? 1;
      const item = getStockItem(id, i.guildId);
      if (!item) return i.reply({ content: 'Item nao encontrado.', ephemeral: true });
      if (item.quantidade < qtd) return i.reply({ content: `Estoque insuficiente. Disponivel: **${item.quantidade}**.`, ephemeral: true });
      const eco   = getEco(i.user.id, i.guildId);
      const total = item.preco * qtd;
      if (eco.coins < total) return i.reply({ content: `Coins insuficientes. Voce tem **${eco.coins}**, precisa de **${total}**.`, ephemeral: true });
      removeCoins(i.user.id, i.guildId, total);
      db.prepare('UPDATE stock SET quantidade=quantidade-? WHERE id=? AND guild_id=?').run(qtd, id, i.guildId);
      for (let k = 0; k < qtd; k++) addItem(i.user.id, i.guildId, { id, nome: item.nome, preco: item.preco });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('Compra realizada!')
        .setDescription(`Voce comprou **${qtd}x ${item.nome}** por **${total} coins**.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('inventario').setDescription('Veja seu inventario')
      .addUserOption(o => o.setName('usuario').setDescription('Ver inventario de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const inv = getEco(u.id, i.guildId).inventario;
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle(`Inventario de ${u.username}`)
        .setDescription(inv.length ? inv.map((it,k)=>`${k+1}. **${it.nome}** - ${it.preco} coins`).join('\n') : 'Inventario vazio.')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('transferir').setDescription('Transfere coins para outro membro')
      .addUserOption(o => o.setName('usuario').setDescription('Destinatario').setRequired(true))
      .addIntegerOption(o => o.setName('valor').setDescription('Quantidade').setRequired(true).setMinValue(1)),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const v = i.options.getInteger('valor');
      if (u.id === i.user.id) return i.reply({ content: 'Voce nao pode transferir para si mesmo.', ephemeral: true });
      if (u.bot) return i.reply({ content: 'Voce nao pode transferir para bots.', ephemeral: true });
      const eco = getEco(i.user.id, i.guildId);
      if (eco.coins < v) return i.reply({ content: `Saldo insuficiente. Voce tem **${eco.coins} coins**.`, ephemeral: true });
      removeCoins(i.user.id, i.guildId, v);
      addCoins(u.id, i.guildId, v);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('Transferencia realizada!')
        .setDescription(`**${i.user.username}** transferiu **${v} coins** para **${u.username}**.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('saldo-top').setDescription('Ranking de coins do servidor'),
    async execute(i) {
      const top = db.prepare('SELECT * FROM economia WHERE guild_id=? ORDER BY coins DESC LIMIT 10').all(i.guildId);
      if (!top.length) return i.reply({ content: 'Sem dados ainda.', ephemeral: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('Top Coins do Servidor')
        .setDescription(top.map((r,k)=>`**${k+1}.** <@${r.user_id}> - **${r.coins} coins**`).join('\n'))] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('dar-coins').setDescription('(Admin) Da coins para um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario alvo').setRequired(true))
      .addIntegerOption(o => o.setName('valor').setDescription('Quantidade').setRequired(true).setMinValue(1))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const v = i.options.getInteger('valor');
      addCoins(u.id, i.guildId, v);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`**${v} coins** adicionados para ${u}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('perfil').setDescription('Veja seu perfil')
      .addUserOption(o => o.setName('usuario').setDescription('Ver perfil de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const s = getSocial(u.id, i.guildId);
      const e = getEco(u.id, i.guildId);
      const avs = db.prepare('SELECT * FROM avaliacoes WHERE to_id=? AND guild_id=?').all(u.id, i.guildId);
      const media = avs.length ? (avs.reduce((a,b)=>a+b.nota,0)/avs.length).toFixed(1) : 'Sem avaliacoes';
      const xpN   = s.nivel * 100;
      const prog  = Math.min(Math.floor((s.xp/xpN)*10),10);
      const barra = 'X'.repeat(prog) + '-'.repeat(10-prog);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Perfil de ${u.username}`)
        .setThumbnail(u.displayAvatarURL())
        .addFields(
          { name: 'Nivel',    value: `${s.nivel}`, inline: true },
          { name: 'XP',       value: `${s.xp}/${xpN}`, inline: true },
          { name: 'Reputacao',value: `${s.reputacao}`, inline: true },
          { name: 'Coins',    value: `${e.coins}`, inline: true },
          { name: 'Media',    value: `${media}`, inline: true },
          { name: 'Progresso XP', value: `\`${barra}\`` },
        ).setTimestamp()] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('nivel').setDescription('Veja seu nivel')
      .addUserOption(o => o.setName('usuario').setDescription('Ver nivel de outro membro')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const s = getSocial(u.id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle(`Nivel de ${u.username}`)
        .addFields({ name: 'Nivel', value: `${s.nivel}`, inline: true }, { name: 'XP', value: `${s.xp}/${s.nivel*100}`, inline: true })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('avaliar').setDescription('Avalia outro membro (1x por dia por pessoa)')
      .addUserOption(o => o.setName('usuario').setDescription('Quem avaliar').setRequired(true))
      .addIntegerOption(o => o.setName('nota').setDescription('Nota de 1 a 5').setRequired(true).setMinValue(1).setMaxValue(5))
      .addStringOption(o => o.setName('comentario').setDescription('Comentario opcional')),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const nota = i.options.getInteger('nota');
      const coment = i.options.getString('comentario') ?? '';
      if (u.id === i.user.id) return i.reply({ content: 'Voce nao pode se avaliar.', ephemeral: true });
      if (u.bot) return i.reply({ content: 'Nao e possivel avaliar bots.', ephemeral: true });
      const ontem = Math.floor(Date.now()/1000) - 86400;
      const jaAvaliou = db.prepare('SELECT id FROM avaliacoes WHERE from_id=? AND to_id=? AND guild_id=? AND criado_em>?').get(i.user.id, u.id, i.guildId, ontem);
      if (jaAvaliou) return i.reply({ content: 'Voce ja avaliou esse membro nas ultimas 24h.', ephemeral: true });
      db.prepare('INSERT INTO avaliacoes (from_id,to_id,guild_id,nota,comentario) VALUES(?,?,?,?,?)').run(i.user.id, u.id, i.guildId, nota, coment);
      addRep(u.id, i.guildId, nota >= 4 ? 1 : nota <= 2 ? -1 : 0);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('Avaliacao enviada!')
        .setDescription(`**${i.user.username}** avaliou **${u.username}** com **${nota}/5**${coment ? `\n"${coment}"` : ''}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('avaliacoes').setDescription('Veja as avaliacoes de um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
    async execute(i) {
      const u = i.options.getUser('usuario');
      const avs = db.prepare('SELECT * FROM avaliacoes WHERE to_id=? AND guild_id=? ORDER BY criado_em DESC').all(u.id, i.guildId);
      if (!avs.length) return i.reply({ content: `**${u.username}** ainda nao tem avaliacoes.`, ephemeral: true });
      const media = (avs.reduce((a,b)=>a+b.nota,0)/avs.length).toFixed(1);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(`Avaliacoes de ${u.username}`)
        .setDescription(`**Media:** ${media}/5 - **Total:** ${avs.length}\n\n${avs.slice(0,5).map(a=>`${a.nota}/5 - <@${a.from_id}>${a.comentario?` - "${a.comentario}"`:''}`).join('\n')}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('reputacao').setDescription('Veja a reputacao de um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario')),
    async execute(i) {
      const u = i.options.getUser('usuario') ?? i.user;
      const s = getSocial(u.id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(s.reputacao >= 0 ? 0xF1C40F : 0xE74C3C)
        .setTitle(`Reputacao de ${u.username}`)
        .setDescription(`**${s.reputacao >= 0 ? '+' : ''}${s.reputacao}** pontos de reputacao`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('stock').setDescription('Veja o estoque de itens'),
    async execute(i) {
      const itens = getStock(i.guildId);
      if (!itens.length) return i.reply({ content: 'Nenhum item no estoque.', ephemeral: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xE67E22).setTitle('Estoque do Servidor')
        .setDescription(itens.map(x=>`**[ID: ${x.id}] ${x.nome}**\n${x.preco} coins | ${x.quantidade}${x.descricao?`\n${x.descricao}`:''}`).join('\n\n'))] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('addstock').setDescription('(Admin) Adiciona item ao estoque')
      .addStringOption(o => o.setName('nome').setDescription('Nome').setRequired(true))
      .addIntegerOption(o => o.setName('preco').setDescription('Preco em coins').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('descricao').setDescription('Descricao'))
      .addStringOption(o => o.setName('imagem').setDescription('URL da imagem'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const nome  = i.options.getString('nome');
      const preco = i.options.getInteger('preco');
      const qtd   = i.options.getInteger('quantidade');
      const desc  = i.options.getString('descricao') ?? '';
      const img   = i.options.getString('imagem') ?? '';
      const res   = db.prepare('INSERT INTO stock (guild_id,nome,descricao,preco,quantidade,imagem) VALUES(?,?,?,?,?,?)').run(i.guildId, nome, desc, preco, qtd, img);
      const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle('Item adicionado!')
        .addFields({ name: 'ID', value: `${res.lastInsertRowid}`, inline: true }, { name: 'Nome', value: nome, inline: true },
                   { name: 'Preco', value: `${preco} coins`, inline: true }, { name: 'Quantidade', value: `${qtd}`, inline: true });
      if (img) embed.setThumbnail(img);
      await i.reply({ embeds: [embed] });
      const cfg = db.prepare('SELECT * FROM config_stock WHERE guild_id=?').get(i.guildId);
      if (cfg && cfg.canal_id) { const c = i.guild.channels.cache.get(cfg.canal_id); if (c) c.send({ embeds: [embed] }).catch(()=>{}); }
    },
  },
  {
    data: new SlashCommandBuilder().setName('editstock').setDescription('(Admin) Edita um item do estoque')
      .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
      .addStringOption(o => o.setName('campo').setDescription('Campo').setRequired(true)
        .addChoices({ name:'Nome', value:'nome' },{ name:'Preco', value:'preco' },{ name:'Quantidade', value:'quantidade' },{ name:'Descricao', value:'descricao' }))
      .addStringOption(o => o.setName('valor').setDescription('Novo valor').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const id    = i.options.getInteger('id');
      const campo = i.options.getString('campo');
      const valor = i.options.getString('valor');
      const item  = getStockItem(id, i.guildId);
      if (!item) return i.reply({ content: 'Item nao encontrado.', ephemeral: true });
      let v = valor;
      if (['preco','quantidade'].includes(campo)) { v = parseInt(valor); if (isNaN(v)||v<0) return i.reply({ content: 'Valor invalido.', ephemeral: true }); }
      db.prepare(`UPDATE stock SET ${campo}=? WHERE id=? AND guild_id=?`).run(v, id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`**${item.nome}** (ID ${id}) - **${campo}** atualizado para **${v}**`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('removestock').setDescription('(Admin) Remove um item do estoque')
      .addIntegerOption(o => o.setName('id').setDescription('ID do item').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const id   = i.options.getInteger('id');
      const item = getStockItem(id, i.guildId);
      if (!item) return i.reply({ content: 'Item nao encontrado.', ephemeral: true });
      db.prepare('DELETE FROM stock WHERE id=? AND guild_id=?').run(id, i.guildId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`**${item.nome}** (ID ${id}) removido.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('setcanal-stock').setDescription('(Admin) Canal de anuncios de stock')
      .addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const c = i.options.getChannel('canal');
      db.prepare('INSERT OR REPLACE INTO config_stock (guild_id,canal_id) VALUES(?,?)').run(i.guildId, c.id);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`Canal de stock definido: ${c}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('pagamento').setDescription('Informacoes de pagamento do servidor'),
    async execute(i) {
      db.prepare('INSERT OR IGNORE INTO pagamento (guild_id) VALUES(?)').run(i.guildId);
      const p = db.prepare('SELECT * FROM pagamento WHERE guild_id=?').get(i.guildId);
      if (!p.tipo) return i.reply({ content: 'Sem metodo de pagamento configurado. Use `/configurarpagamento`.', ephemeral: true });
      const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('Informacoes de Pagamento')
        .addFields({ name: 'Tipo', value: p.tipo, inline: true }, { name: 'Chave / Contato', value: p.chave||'-', inline: true });
      if (p.instrucoes) e.addFields({ name: 'Instrucoes', value: p.instrucoes });
      await i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('configurarpagamento').setDescription('(Admin) Configura informacoes de pagamento')
      .addStringOption(o => o.setName('tipo').setDescription('Tipo').setRequired(true)
        .addChoices({ name:'PIX', value:'PIX' },{ name:'PayPal', value:'PayPal' },{ name:'PicPay', value:'PicPay' },{ name:'Mercado Pago', value:'Mercado Pago' },{ name:'Outro', value:'Outro' }))
      .addStringOption(o => o.setName('chave').setDescription('Chave / contato').setRequired(true))
      .addStringOption(o => o.setName('instrucoes').setDescription('Instrucoes extras'))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const tipo = i.options.getString('tipo');
      const chave = i.options.getString('chave');
      const inst  = i.options.getString('instrucoes') ?? '';
      db.prepare('INSERT OR REPLACE INTO pagamento (guild_id,tipo,chave,instrucoes) VALUES(?,?,?,?)').run(i.guildId, tipo, chave, inst);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('Pagamento configurado!')
        .addFields({ name: 'Tipo', value: tipo, inline: true }, { name: 'Chave', value: chave, inline: true })], ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder().setName('ticket').setDescription('Abre um ticket de suporte')
      .addStringOption(o => o.setName('assunto').setDescription('Assunto do ticket').setRequired(true)),
    async execute(i) {
      const assunto = i.options.getString('assunto');
      const cfg = getConfigTicket(i.guildId);
      if (!cfg.categoria_id) return i.reply({ content: 'Tickets nao configurados. Peca ao admin usar `/configurarticket`.', ephemeral: true });
      const nomeCanal = `ticket-${i.user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,20)}`;
      const existente = i.guild.channels.cache.find(c => c.name === nomeCanal && c.parentId === cfg.categoria_id);
      if (existente) return i.reply({ content: `Voce ja tem um ticket aberto: ${existente}`, ephemeral: true });
      const canal = await i.guild.channels.create({
        name: nomeCanal, type: ChannelType.GuildText, parent: cfg.categoria_id,
        permissionOverwrites: [
          { id: i.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ...(cfg.cargo_suporte ? [{ id: cfg.cargo_suporte, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
          { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ],
      });
      db.prepare('INSERT INTO tickets (guild_id,canal_id,user_id,assunto) VALUES(?,?,?,?)').run(i.guildId, canal.id, i.user.id, assunto);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setStyle(ButtonStyle.Primary),
      );
      await canal.send({ content: `${i.user}${cfg.cargo_suporte ? ` <@&${cfg.cargo_suporte}>` : ''}`,
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Ticket - ${assunto}`).setDescription(`Ola ${i.user}! Descreva seu problema.\n\nAssunto: ${assunto}`).setTimestamp()],
        components: [row] });
      await i.reply({ content: `Ticket criado: ${canal}`, ephemeral: true });
      if (cfg.canal_log) { const lc = i.guild.channels.cache.get(cfg.canal_log); if (lc) lc.send({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`Ticket aberto por ${i.user} - **${assunto}** - ${canal}`).setTimestamp()] }).catch(()=>{}); }
    },
  },
  {
    data: new SlashCommandBuilder().setName('fecharticket').setDescription('Fecha o ticket do canal atual'),
    async execute(i) {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: 'Este canal nao e um ticket aberto.', ephemeral: true });
      db.prepare('UPDATE tickets SET status="fechado" WHERE canal_id=?').run(i.channelId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`Fechado por ${i.user}. Canal excluido em 5s.`)] });
      const cfg = getConfigTicket(i.guildId);
      if (cfg.canal_log) { const lc = i.guild.channels.cache.get(cfg.canal_log); if (lc) lc.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`Ticket fechado por ${i.user} - Canal: ${i.channel.name}`).setTimestamp()] }).catch(()=>{}); }
      setTimeout(() => i.channel.delete().catch(()=>{}), 5000);
    },
  },
  {
    data: new SlashCommandBuilder().setName('assumirticket').setDescription('Assume o ticket do canal atual'),
    async execute(i) {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: 'Este canal nao e um ticket aberto.', ephemeral: true });
      db.prepare('UPDATE tickets SET assumido_por=? WHERE canal_id=?').run(i.user.id, i.channelId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`${i.user} assumiu este ticket.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('adicionarticket').setDescription('Adiciona um membro ao ticket')
      .addUserOption(o => o.setName('usuario').setDescription('Membro a adicionar').setRequired(true)),
    async execute(i) {
      if (!getTicketByCanal(i.channelId)) return i.reply({ content: 'Este canal nao e um ticket aberto.', ephemeral: true });
      const u = i.options.getUser('usuario');
      await i.channel.permissionOverwrites.edit(u.id, { [PermissionFlagsBits.ViewChannel]: true, [PermissionFlagsBits.SendMessages]: true });
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`${u} adicionado ao ticket.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('painel-ticket').setDescription('(Admin) Envia o painel de abertura de tickets')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const cfg = getConfigTicket(i.guildId);
      await i.channel.send({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Central de Suporte').setDescription(cfg.mensagem || 'Clique no botao abaixo para abrir um ticket.')],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('abrir_ticket_painel').setLabel('Abrir Ticket').setStyle(ButtonStyle.Primary))],
      });
      await i.reply({ content: 'Painel enviado!', ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder().setName('configurarticket').setDescription('(Admin) Configura o sistema de tickets')
      .addSubcommand(s => s.setName('categoria').setDescription('Categoria dos tickets').addChannelOption(o => o.setName('categoria').setDescription('Categoria').setRequired(true)))
      .addSubcommand(s => s.setName('log').setDescription('Canal de logs').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)))
      .addSubcommand(s => s.setName('cargo').setDescription('Cargo de suporte').addRoleOption(o => o.setName('cargo').setDescription('Cargo').setRequired(true)))
      .addSubcommand(s => s.setName('mensagem').setDescription('Mensagem do painel').addStringOption(o => o.setName('texto').setDescription('Texto').setRequired(true)))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const sub = i.options.getSubcommand();
      db.prepare('INSERT OR IGNORE INTO config_ticket (guild_id) VALUES(?)').run(i.guildId);
      if (sub === 'categoria') { const c = i.options.getChannel('categoria'); db.prepare('UPDATE config_ticket SET categoria_id=? WHERE guild_id=?').run(c.id, i.guildId); return i.reply({ content: `Categoria: ${c}`, ephemeral: true }); }
      if (sub === 'log')       { const c = i.options.getChannel('canal');    db.prepare('UPDATE config_ticket SET canal_log=? WHERE guild_id=?').run(c.id, i.guildId); return i.reply({ content: `Canal de log: ${c}`, ephemeral: true }); }
      if (sub === 'cargo')     { const r = i.options.getRole('cargo');       db.prepare('UPDATE config_ticket SET cargo_suporte=? WHERE guild_id=?').run(r.id, i.guildId); return i.reply({ content: `Cargo de suporte: ${r}`, ephemeral: true }); }
      if (sub === 'mensagem')  { const t = i.options.getString('texto');     db.prepare('UPDATE config_ticket SET mensagem=? WHERE guild_id=?').run(t, i.guildId); return i.reply({ content: 'Mensagem atualizada.', ephemeral: true }); }
    },
  },
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registrarComandos() {
  const json = commands.map(c => c.data.toJSON());
  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: json });
      console.log(`[VKBot] ${json.length} comandos registrados no servidor`);
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: json });
      console.log(`[VKBot] ${json.length} comandos registrados globalmente`);
    }
  } catch (e) { console.error('[VKBot] Erro ao registrar comandos:', e); }
}

client.once(Events.ClientReady, async c => {
  console.log(`[VKBot] Online como ${c.user.tag}`);
  c.user.setActivity('/ajuda', { type: 3 });
  await registrarComandos();
});

client.on(Events.InteractionCreate, async i => {
  if (i.isChatInputCommand()) {
    const cmd = client.commands.get(i.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(i);
      if (!i.user.bot) {
        const subiu = addXp(i.user.id, i.guildId, 10);
        if (subiu) {
          const s = getSocial(i.user.id, i.guildId);
          i.channel.send({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setDescription(`${i.user} subiu para o **nivel ${s.nivel}**!`)] }).catch(()=>{});
        }
      }
    } catch (e) {
      console.error(`[VKBot] Erro /${i.commandName}:`, e);
      const m = { content: 'Ocorreu um erro ao executar este comando.', ephemeral: true };
      if (i.replied || i.deferred) i.followUp(m).catch(()=>{}); else i.reply(m).catch(()=>{});
    }
    return;
  }

  if (i.isButton()) {
    if (i.customId === 'fechar_ticket') {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: 'Ticket nao encontrado.', ephemeral: true });
      db.prepare('UPDATE tickets SET status="fechado" WHERE canal_id=?').run(i.channelId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`Fechado por ${i.user}. Canal excluido em 5s.`)] });
      const cfg = getConfigTicket(i.guildId);
      if (cfg.canal_log) { const lc = i.guild.channels.cache.get(cfg.canal_log); if (lc) lc.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`Ticket fechado por ${i.user} - ${i.channel.name}`).setTimestamp()] }).catch(()=>{}); }
      setTimeout(() => i.channel.delete().catch(()=>{}), 5000);
      return;
    }
    if (i.customId === 'assumir_ticket') {
      const t = getTicketByCanal(i.channelId);
      if (!t) return i.reply({ content: 'Ticket nao encontrado.', ephemeral: true });
      db.prepare('UPDATE tickets SET assumido_por=? WHERE canal_id=?').run(i.user.id, i.channelId);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`${i.user} assumiu este ticket.`)] });
      return;
    }
    if (i.customId === 'abrir_ticket_painel') {
      await i.showModal(new ModalBuilder().setCustomId('modal_ticket').setTitle('Abrir Ticket')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('assunto').setLabel('Assunto').setStyle(TextInputStyle.Short).setPlaceholder('Descreva brevemente').setRequired(true).setMaxLength(100)
        )));
      return;
    }
  }

  if (i.isModalSubmit() && i.customId === 'modal_ticket') {
    const assunto = i.fields.getTextInputValue('assunto');
    const cfg = getConfigTicket(i.guildId);
    if (!cfg.categoria_id) return i.reply({ content: 'Sistema de tickets nao configurado.', ephemeral: true });
    const nomeCanal = `ticket-${i.user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,20)}`;
    const existente = i.guild.channels.cache.find(c => c.name === nomeCanal && c.parentId === cfg.categoria_id);
    if (existente) return i.reply({ content: `Voce ja tem um ticket aberto: ${existente}`, ephemeral: true });
    const canal = await i.guild.channels.create({
      name: nomeCanal, type: ChannelType.GuildText, parent: cfg.categoria_id,
      permissionOverwrites: [
        { id: i.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ...(cfg.cargo_suporte ? [{ id: cfg.cargo_suporte, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
      ],
    });
    db.prepare('INSERT INTO tickets (guild_id,canal_id,user_id,assunto) VALUES(?,?,?,?)').run(i.guildId, canal.id, i.user.id, assunto);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fechar_ticket').setLabel('Fechar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('assumir_ticket').setLabel('Assumir').setStyle(ButtonStyle.Primary),
    );
    await canal.send({ content: `${i.user}${cfg.cargo_suporte ? ` <@&${cfg.cargo_suporte}>` : ''}`,
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`Ticket - ${assunto}`).setDescription(`Ola ${i.user}! Descreva seu problema.\n\nAssunto: ${assunto}`).setTimestamp()],
      components: [row] });
    await i.reply({ content: `Ticket criado: ${canal}`, ephemeral: true });
    if (cfg.canal_log) { const lc = i.guild.channels.cache.get(cfg.canal_log); if (lc) lc.send({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setDescription(`Ticket aberto por ${i.user} - **${assunto}** - ${canal}`).setTimestamp()] }).catch(()=>{}); }
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[VKBot] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[VKBot] uncaughtException:', err);
});

const http = require('http');

_This response is too long to display in full._
