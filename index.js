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
function getRep(id) { if (!db.reputacoes[id]) db.reputacoes[id] = { total: 0, votos: 0, quemDeu: new Set() }; return db.reputacoes[id]; }

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
  new SlashCommandBuilder().setName("reputacao").setDescription("🌟 Dar +1 de reputação a um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  new SlashCommandBuilder().setName("perfil").setDescription("👤 Ver seu perfil completo").addUserOption(o => o.setName("usuario").setDescription("Usuário")),
  new SlashCommandBuilder().setName("nivel").setDescription("📈 Ver seu nível e XP"),
  new SlashCommandBuilder().setName("dado").setDescription("🎲 Joga um dado de 6 faces"),
  new SlashCommandBuilder().setName("cara-ou-coroa").setDescription("🪙 Joga uma moeda"),
  new SlashCommandBuilder().setName("oi").setDescription("👋 O bot te manda um salve!"),
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async (c) => {
  console.log(`✅ Bot online! Logado como: ${c.user.tag}`);
  c.user.setPresence({ status: "online", activities: [{ name: "Online 🟢", type: ActivityType.Custom }] });
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands.map(cmd => cmd.toJSON()) });
    console.log(`✅ ${commands.length} comandos registrados!`);
  } catch (err) {
    console.error("❌ Erro ao registrar comandos:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const user = interaction.user;

  try {
    if (commandName === "ping") {
      return interaction.reply(`🏓 Pong! Latência: **${Date.now() - interaction.createdTimestamp}ms**`);
    }
    if (commandName === "ajuda") {
      const embed = new EmbedBuilder().setTitle("📋 Comandos disponíveis").setColor(0x5865f2)
        .addFields(
          { name: "🎮 Gerais", value: "/ping • /ajuda • /info • /servidor • /oi • /dado • /cara-ou-coroa" },
          { name: "💰 Economia", value: "/carteira • /loja • /comprar • /inventario • /transferir • /saldo-top • /dar-coins" },
          { name: "📊 Social", value: "/perfil • /nivel • /avaliar • /avaliacoes • /reputacao" }
        ).setFooter({ text: "Bot sempre online 24/7 🟢" });
      return interaction.reply({ embeds: [embed] });
    }
    if (commandName === "info") {
      const alvo = interaction.options.getUser("usuario") ?? user;
      const member = interaction.guild?.members.cache.get(alvo.id);
      const embed = new EmbedBuilder().setTitle(`ℹ️ ${alvo.username}`).setColor(0x5865f2)
        .setThumbnail(alvo.displayAvatarURL())
        .addFields(
          { name: "ID", value: alvo.id, inline: true },
          { name: "Conta criada", value: alvo.createdAt.toLocaleDateString("pt-BR"), inline: true },
          { name: "Entrou no servidor", value: member?.joinedAt?.toLocaleDateString("pt-BR") ?? "N/A", inline: true }
        ).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    if (commandName === "servidor") {
      const g = interaction.guild;
      const embed = new EmbedBuilder().setTitle(`🌐 ${g.name}`).setColor(0x5865f2)
        .setThumbnail(g.iconURL())
        .addFields(
          { name: "Membros", value: `${g.memberCount}`, inline: true },
          { name: "Criado em", value: g.createdAt.toLocaleDateString("pt-BR"), inline: true },
          { name: "Dono", value: `<@${g.ownerId}>`, inline: true }
        ).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    if (commandName === "oi") {
      const respostas = [`Salve, ${user.displayName}! 👋`, `Eae ${user.displayName}! 😎`, `Oi ${user.displayName}! 🙌`, `Fala ${user.displayName}! 🤙`];
      return interaction.reply(respostas[Math.floor(Math.random() * respostas.length)]);
    }
    if (commandName === "dado") {
      return interaction.reply(`🎲 Você tirou: **${Math.floor(Math.random() * 6) + 1}**`);
    }
    if (commandName === "cara-ou-coroa") {
      return interaction.reply(Math.random() < 0.5 ? "🪙 **Cara!**" : "🪙 **Coroa!**");
    }
    if (commandName === "loja") {
      const embed = new EmbedBuilder().setTitle("🏪 Loja").setColor(0xffd700)
        .setDescription(LOJA_ITENS.map(i => `${i.nome} — **${i.preco} moedas**\n> ${i.descricao}`).join("\n\n"));
      return interaction.reply({ embeds: [embed] });
    }
    if (commandName === "comprar") {
      const itemId = interaction.options.getString("item");
      const item = LOJA_ITENS.find(i => i.id === itemId);
      if (!item) return interaction.reply({ content: "❌ Item não encontrado.", ephemeral: true });
      const saldo = getSaldo(user.id);
      if (saldo < item.preco) return interaction.reply({ content: `❌ Saldo insuficiente! Você tem **${saldo} moedas** e o item custa **${item.preco} moedas**.`, ephemeral: true });
      setSaldo(user.id, saldo - item.preco);
      getInv(user.id).push({ id: item.id, nome: item.nome });
      addXP(user.id, 20);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle("✅ Compra realizada!").setColor(0x00ff88)
        .addFields({ name: "Item", value: item.nome, inline: true }, { name: "Pago", value: `${item.preco} moedas`, inline: true }, { name: "Saldo restante", value: `${getSaldo(user.id)} moedas`, inline: true }).setTimestamp()] });
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
        .addFields({ name: "Média geral", value: `⭐ ${media}/5 (${avs.length} avaliações)` }).setTimestamp()] });
    }
    if (commandName === "reputacao") {
      const alvo = interaction.options.getUser("usuario");
      if (alvo.id === user.id) return interaction.reply({ content: "❌ Você não pode dar reputação para si mesmo!", ephemeral: true });
      const rep = getRep(alvo.id);
      if (rep.quemDeu.has(user.id)) return interaction.reply({ content: "❌ Você já deu reputação para este usuário!", ephemeral: true });
      rep.quemDeu.add(user.id);
      rep.total += 1;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🌟 Reputação adicionada!").setColor(0xffd700)
        .addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Total de reputação", value: `${rep.total}`, inline: true }).setTimestamp()] });
    }
    if (commandName === "perfil") {
      const alvo = interaction.options.getUser("usuario") ?? user;
      const rep = getRep(alvo.id);
      const xp = getXP(alvo.id);
      const inv = getInv(alvo.id);
      const avs = db.avaliacoes[alvo.id] ?? [];
      const media = avs.length ? (avs.reduce((a, b) => a + b.estrelas, 0) / avs.length).toFixed(1) : "N/A";
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 Perfil de ${alvo.username}`).setColor(0x5865f2)
        .setThumbnail(alvo.displayAvatarURL())
        .addFields(
          { name: "💰 Saldo", value: `${getSaldo(alvo.id)} moedas`, inline: true },
          { name: "🌟 Reputação", value: `${rep.total}`, inline: true },
          { name: "📈 Nível", value: `${xp.nivel} (${xp.xp} XP)`, inline: true },
          { name: "🎒 Itens", value: `${inv.length}`, inline: true },
          { name: "⭐ Avaliação", value: media !== "N/A" ? `${media}/5` : "Sem avaliações", inline: true }
        ).setTimestamp()] });
    }
    if (commandName === "nivel") {
      const xp = getXP(user.id);
      const xpNecessario = xp.nivel * 100;
      const progresso = Math.floor((xp.xp / xpNecessario) * 10);
      const barra = "█".repeat(progresso) + "░".repeat(10 - progresso);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📈 Nível de ${user.username}`).setColor(0x5865f2)
        .addFields(
          { name: "Nível", value: `${xp.nivel}`, inline: true },
          { name: "XP", value: `${xp.xp} / ${xpNecessario}`, inline: true },
          { name: "Progresso", value: `[${barra}]` }
        ).setTimestamp()] });
    }
  } catch (err) {
    console.error(`Erro no comando ${commandName}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Ocorreu um erro ao executar este comando.", ephemeral: true }).catch(() => null);
    }
  }
});

client.on("error", (err) => console.error("Erro no bot:", err));
client.login(token).catch((err) => { console.error("Falha ao conectar:", err); process.exit(1); });
