import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType,
} from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("DISCORD_BOT_TOKEN não definido!"); process.exit(1); }

const db = {
  carteiras: {},
  inventarios: {},
  avaliacoes: {},
  reputacoes: {},
  casamentos: {},
  xp: {},
};

const LOJA_ITENS = [
  { id: "espada",  nome: "⚔️ Espada",      preco: 500,  descricao: "Uma espada poderosa" },
  { id: "escudo",  nome: "🛡️ Escudo",      preco: 400,  descricao: "Proteção máxima" },
  { id: "pocao",   nome: "🧪 Poção",        preco: 150,  descricao: "Recupera sua energia" },
  { id: "arco",    nome: "🏹 Arco",         preco: 350,  descricao: "Ataque à distância" },
  { id: "anel",    nome: "💍 Anel Mágico",  preco: 800,  descricao: "Aumenta seu poder" },
  { id: "chapeu",  nome: "🎩 Chapéu VIP",   preco: 1000, descricao: "Item exclusivo VIP" },
];

function getSaldo(id) { if (!db.carteiras[id]) db.carteiras[id] = 500; return db.carteiras[id]; }
function setSaldo(id, v) { db.carteiras[id] = Math.max(0, v); }
function getInv(id) { if (!db.inventarios[id]) db.inventarios[id] = []; return db.inventarios[id]; }
function getXP(id) { if (!db.xp[id]) db.xp[id] = { xp: 0, nivel: 1 }; return db.xp[id]; }
function addXP(id, qtd) {
  const u = getXP(id);
  u.xp += qtd;
  const xpNecessario = u.nivel * 100;
  if (u.xp >= xpNecessario) { u.xp -= xpNecessario; u.nivel++; }
}
function getRep(id) { if (!db.reputacoes[id]) db.reputacoes[id] = { total: 0, quemDeu: new Set() }; return db.reputacoes[id]; }

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("🏓 Verifica a latência do bot"),
  new SlashCommandBuilder().setName("ajuda").setDescription("📋 Lista todos os comandos"),
  new SlashCommandBuilder().setName("info").setDescription("ℹ️ Informações sobre um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário")),
  new SlashCommandBuilder().setName("servidor").setDescription("🌐 Informações do servidor"),
  new SlashCommandBuilder().setName("loja").setDescription("🏪 Ver os itens da loja"),
  new SlashCommandBuilder().setName("comprar").setDescription("🛒 Comprar um item da loja").addStringOption(o => o.setName("item").setDescription("Item").setRequired(true).addChoices(...LOJA_ITENS.map(i => ({ name: i.nome, value: i.id })))),
  new SlashCommandBuilder().setName("inventario").setDescription("🎒 Ver seu inventário"),
  new SlashCommandBuilder().setName("carteira").setDescription("💰 Ver seu saldo"),
  new SlashCommandBuilder().setName("dar-coins").setDescription("💸 [Admin] Dar moedas").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setRequired(true).setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName("transferir").setDescription("💳 Transferir moedas para outro usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("saldo-top").setDescription("🏆 Ranking dos usuários mais ricos"),
  new SlashCommandBuilder().setName("avaliar").setDescription("⭐ Avaliar um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("estrelas").setDescription("Nota 1-5").setRequired(true).setMinValue(1).setMaxValue(5)).addStringOption(o => o.setName("comentario").setDescription("Comentário")),
  new SlashCommandBuilder().setName("avaliacoes").setDescription("📊 Ver avaliações de um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  new SlashCommandBuilder().setName("reputacao").setDescription("👍 Dar reputação a um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  new SlashCommandBuilder().setName("perfil").setDescription("🪪 Ver perfil completo").addUserOption(o => o.setName("usuario").setDescription("Usuário (opcional)")),
  new SlashCommandBuilder().setName("dado").setDescription("🎲 Rolar um dado").addIntegerOption(o => o.setName("lados").setDescription("Número de lados (padrão: 6)").setMinValue(2).setMaxValue(100)),
  new SlashCommandBuilder().setName("coinflip").setDescription("🪙 Cara ou coroa"),
  new SlashCommandBuilder().setName("sorteio").setDescription("🎉 Sortear um vencedor do servidor"),
  new SlashCommandBuilder().setName("casamento").setDescription("💒 Casar com alguém no servidor").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  new SlashCommandBuilder().setName("nivel").setDescription("📈 Ver seu nível de atividade").addUserOption(o => o.setName("usuario").setDescription("Usuário (opcional)")),
  new SlashCommandBuilder().setName("mutar").setDescription("🔇 Mutar um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo")).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("desmutar").setDescription("🔊 Desmutar um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("kick").setDescription("👢 Expulsar um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo")).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName("ban").setDescription("🔨 Banir um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo")).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName("limpar").setDescription("🧹 Apagar mensagens do canal").addIntegerOption(o => o.setName("quantidade").setDescription("Qtd (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("anuncio").setDescription("📢 [Admin] Fazer um anúncio").addStringOption(o => o.setName("mensagem").setDescription("Mensagem do anúncio").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent],
});

client.once("clientReady", async (c) => {
  console.log(`✅ Bot conectado como ${c.user.tag}`);
  c.user.setPresence({ status: "online", activities: [{ name: "Use /ajuda", type: ActivityType.Watching }] });
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(c.user.id), { body: commands.map(c => c.toJSON()) });
  console.log("✅ Comandos registrados!");
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  addXP(message.author.id, 5);
  if (message.mentions.has(client.user)) {
    message.reply("👋 Olá! Use **/ajuda** para ver todos os meus comandos!");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, guild } = interaction;

  if (commandName === "ping") {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏓 Pong!").setColor(0x00ff88).addFields({ name: "Latência", value: `${Math.round(client.ws.ping)}ms`, inline: true }).setTimestamp()] });
  }
  if (commandName === "ajuda") {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("📋 Comandos Disponíveis").setColor(0x5865f2)
      .addFields(
        { name: "🛠️ Utilidade", value: "`/ping` `/info` `/servidor` `/ajuda`" },
        { name: "🏪 Loja", value: "`/loja` `/comprar` `/inventario` `/carteira`\n`/transferir` `/dar-coins` `/saldo-top`" },
        { name: "⭐ Social", value: "`/avaliar` `/avaliacoes` `/reputacao` `/perfil`\n`/casamento` `/nivel`" },
        { name: "🎮 Diversão", value: "`/dado` `/coinflip` `/sorteio`" },
        { name: "🔨 Moderação", value: "`/mutar` `/desmutar` `/kick` `/ban`\n`/limpar` `/anuncio`" },
      ).setFooter({ text: "Me marque para falar comigo!" }).setTimestamp()] });
  }
  if (commandName === "info") {
    const alvo = interaction.options.getUser("usuario") ?? user;
    const membro = await guild?.members.fetch(alvo.id).catch(() => null);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${alvo.username}`).setThumbnail(alvo.displayAvatarURL()).setColor(0x5865f2)
      .addFields(
        { name: "ID", value: alvo.id, inline: true },
        { name: "Conta criada", value: `<t:${Math.floor(alvo.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "Entrou no servidor", value: membro ? `<t:${Math.floor(membro.joinedTimestamp / 1000)}:D>` : "N/A", inline: true },
      ).setTimestamp()] });
  }
  if (commandName === "servidor") {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🌐 ${guild.name}`).setThumbnail(guild.iconURL()).setColor(0x5865f2)
      .addFields(
        { name: "Dono", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Membros", value: `${guild.memberCount}`, inline: true },
        { name: "Criado em", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
      ).setTimestamp()] });
  }
  if (commandName === "loja") {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏪 Loja").setColor(0xffd700)
      .setDescription(LOJA_ITENS.map(i => `${i.nome} — **${i.preco} moedas**\n> ${i.descricao}`).join("\n\n"))
      .setFooter({ text: "Use /comprar [item] para comprar!" }).setTimestamp()] });
  }
  if (commandName === "comprar") {
    const item = LOJA_ITENS.find(i => i.id === interaction.options.getString("item"));
    const saldo = getSaldo(user.id);
    if (saldo < item.preco) return interaction.reply({ content: `❌ Saldo insuficiente! Você tem **${saldo} moedas**, o item custa **${item.preco}**.`, ephemeral: true });
    setSaldo(user.id, saldo - item.preco);
    getInv(user.id).push({ id: item.id, nome: item.nome });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🛒 Compra realizada!").setColor(0x00ff88)
      .addFields({ name: "Item", value: item.nome, inline: true }, { name: "Preço", value: `${item.preco} moedas`, inline: true }, { name: "Saldo restante", value: `${getSaldo(user.id)} moedas`, inline: true }).setTimestamp()] });
  }
  if (commandName === "inventario") {
    const inv = getInv(user.id);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🎒 Inventário de ${user.username}`).setColor(0x5865f2)
      .setDescription(inv.length ? inv.map(i => `• ${i.nome}`).join("\n") : "Inventário vazio! Use `/loja` para comprar itens.").setTimestamp()] });
  }
  if (commandName === "carteira") {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Carteira de ${user.username}`).setColor(0xffd700)
      .addFields({ name: "Saldo", value: `${getSaldo(user.id)} moedas` }).setTimestamp()] });
  }
  if (commandName === "dar-coins") {
    const alvo = interaction.options.getUser("usuario");
    const qtd = interaction.options.getInteger("quantia");
    setSaldo(alvo.id, getSaldo(alvo.id) + qtd);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("💸 Moedas enviadas!").setColor(0x00ff88)
      .addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Quantia", value: `${qtd} moedas`, inline: true }, { name: "Saldo atual", value: `${getSaldo(alvo.id)} moedas`, inline: true }).setTimestamp()] });
  }
  if (commandName === "transferir") {
    const alvo = interaction.options.getUser("usuario");
    const qtd = interaction.options.getInteger("quantia");
    if (alvo.id === user.id) return interaction.reply({ content: "❌ Você não pode transferir para si mesmo!", ephemeral: true });
    if (getSaldo(user.id) < qtd) return interaction.reply({ content: `❌ Saldo insuficiente! Você tem **${getSaldo(user.id)} moedas**.`, ephemeral: true });
    setSaldo(user.id, getSaldo(user.id) - qtd);
    setSaldo(alvo.id, getSaldo(alvo.id) + qtd);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("💳 Transferência realizada!").setColor(0x00ff88)
      .addFields({ name: "Para", value: alvo.username, inline: true }, { name: "Quantia", value: `${qtd} moedas`, inline: true }, { name: "Seu saldo", value: `${getSaldo(user.id)} moedas`, inline: true }).setTimestamp()] });
  }
  if (commandName === "saldo-top") {
    const ranking = Object.entries(db.carteiras).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const desc = ranking.length ? ranking.map(([id, saldo], i) => `**${i + 1}.** <@${id}> — ${saldo} moedas`).join("\n") : "Nenhum usuário ainda.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Ranking de Moedas").setColor(0xffd700).setDescription(desc).setTimestamp()] });
  }
  if (commandName === "avaliar") {
    const alvo = interaction.options.getUser("usuario");
    const estrelas = interaction.options.getInteger("estrelas");
    const comentario = interaction.options.getString("comentario") ?? "Sem comentário";
    if (alvo.id === user.id) return interaction.reply({ content: "❌ Você não pode se avaliar!", ephemeral: true });
    if (!db.avaliacoes[alvo.id]) db.avaliacoes[alvo.id] = [];
    db.avaliacoes[alvo.id].push({ avaliadorTag: user.username, estrelas, comentario, data: new Date().toLocaleDateString("pt-BR") });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("⭐ Avaliação registrada!").setColor(0xffd700)
      .addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Nota", value: "⭐".repeat(estrelas), inline: true }, { name: "Comentário", value: comentario }).setTimestamp()] });
  }
  if (commandName === "avaliacoes") {
    const alvo = interaction.options.getUser("usuario");
    const avs = db.avaliacoes[alvo.id] ?? [];
    if (!avs.length) return interaction.reply({ content: `❌ **${alvo.username}** ainda não tem avaliações.`, ephemeral: true });
    const media = (avs.reduce((a, b) => a + b.estrelas, 0) / avs.length).toFixed(1);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📊 Avaliações de ${alvo.username}`).setColor(0xffd700)
      .setDescription(avs.slice(-5).map(a => `⭐ ${a.estrelas}/5 — **${a.avaliadorTag}**\n> ${a.comentario}\n> 📅 ${a.data}`).join("\n\n"))
      .addFields({ name: "Média geral", value: `⭐ ${media}/5 (${avs.length} avaliações)`
