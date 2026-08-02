import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("❌ Token não encontrado! Defina DISCORD_TOKEN."); process.exit(1); }

// ── Banco de dados em memória ────────────────────────────────────────────────
const db = {
  carteiras: {},
  inventarios: {},
  avaliacoes: {},
  reputacoes: {},
  xp: {},
  // Stock
  stock: [],          // [{ id, nome, emoji, preco, quantidade, descricao, categoria, imagem }]
  canalStock: null,   // ID do canal de notificações de stock
  // Pagamento
  pagamento: null,    // { tipo, chave, titular, info }
  // Ticket
  ticketCategoria: null,    // ID da categoria onde criar canais
  ticketCargos: [],         // IDs dos cargos de suporte
  ticketLogCanal: null,     // ID do canal de logs de ticket
  ticketContador: 0,        // contador de tickets
  ticketsAbertos: {},       // { canalId: { userId, numero, claimId, assunto, categoria, abertoPor } }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const LOJA_ITENS = [
  { id: "espada",  nome: "⚔️ Espada",      preco: 500,  descricao: "Uma espada poderosa" },
  { id: "escudo",  nome: "🛡️ Escudo",      preco: 400,  descricao: "Proteção máxima" },
  { id: "pocao",   nome: "🧪 Poção",        preco: 150,  descricao: "Recupera sua energia" },
  { id: "arco",    nome: "🏹 Arco",         preco: 350,  descricao: "Ataque à distância" },
  { id: "anel",    nome: "💍 Anel Mágico",  preco: 800,  descricao: "Aumenta seu poder" },
  { id: "chapeu",  nome: "🎩 Chapéu VIP",   preco: 1000, descricao: "Item exclusivo VIP" },
];

const TICKET_CATEGORIAS = ["🛒 Compra", "❓ Dúvida", "🐛 Bug/Problema", "💡 Sugestão", "⚠️ Denúncia", "🔧 Outro"];

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

// Notifica canal de stock automaticamente
async function notificarStock(client, guildId) {
  if (!db.canalStock) return;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const canal = guild.channels.cache.get(db.canalStock);
    if (!canal) return;
    const itens = db.stock;
    const embed = new EmbedBuilder()
      .setTitle("📦 Stock Atualizado")
      .setColor(itens.length > 0 ? 0x00ff88 : 0xff4444)
      .setTimestamp()
      .setFooter({ text: "Atualização automática de stock" });
    if (itens.length === 0) {
      embed.setDescription("❌ Sem itens em stock no momento.");
    } else {
      const porCategoria = {};
      for (const i of itens) {
        const cat = i.categoria || "Geral";
        if (!porCategoria[cat]) porCategoria[cat] = [];
        porCategoria[cat].push(i);
      }
      for (const [cat, items] of Object.entries(porCategoria)) {
        embed.addFields({
          name: `📂 ${cat}`,
          value: items.map(i =>
            `${i.emoji || "📦"} **${i.nome}** — 💰 ${i.preco} moedas | 📦 ${i.quantidade} un.\n> ${i.descricao}`
          ).join("\n"),
        });
      }
    }
    await canal.send({ embeds: [embed] });
  } catch (err) {
    console.error("❌ Erro ao notificar stock:", err.message);
  }
}

// Gera transcript de um canal de ticket
async function gerarTranscript(canal) {
  try {
    const msgs = await canal.messages.fetch({ limit: 100 });
    const ordenadas = [...msgs.values()].reverse();
    const linhas = ordenadas.map(m => {
      const hora = m.createdAt.toLocaleString("pt-BR");
      const conteudo = m.content || (m.embeds.length ? "[Embed]" : "[Arquivo]");
      return `[${hora}] ${m.author.tag}: ${conteudo}`;
    });
    return linhas.join("\n");
  } catch {
    return "Não foi possível gerar o transcript.";
  }
}

// ── Definição dos comandos ───────────────────────────────────────────────────
const commands = [
  // Gerais
  new SlashCommandBuilder().setName("ping").setDescription("🏓 Verifica a latência do bot"),
  new SlashCommandBuilder().setName("ajuda").setDescription("📋 Lista todos os comandos"),
  new SlashCommandBuilder().setName("info").setDescription("ℹ️ Informações sobre um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário")),
  new SlashCommandBuilder().setName("servidor").setDescription("🌐 Informações do servidor"),
  new SlashCommandBuilder().setName("oi").setDescription("👋 O bot te manda um salve!"),
  new SlashCommandBuilder().setName("dado").setDescription("🎲 Joga um dado de 6 faces"),
  new SlashCommandBuilder().setName("cara-ou-coroa").setDescription("🪙 Joga uma moeda"),
  // Economia
  new SlashCommandBuilder().setName("loja").setDescription("🏪 Ver os itens da loja"),
  new SlashCommandBuilder().setName("comprar").setDescription("🛒 Comprar um item da loja").addStringOption(o => o.setName("item").setDescription("Item").setRequired(true).addChoices(...LOJA_ITENS.map(i => ({ name: i.nome, value: i.id })))),
  new SlashCommandBuilder().setName("inventario").setDescription("🎒 Ver seu inventário"),
  new SlashCommandBuilder().setName("carteira").setDescription("💰 Ver seu saldo"),
  new SlashCommandBuilder().setName("dar-coins").setDescription("💸 [Admin] Dar moedas").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setRequired(true).setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName("transferir").setDescription("💳 Transferir moedas").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("saldo-top").setDescription("🏆 Ranking dos mais ricos"),
  // Social
  new SlashCommandBuilder().setName("avaliar").setDescription("⭐ Avaliar um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("estrelas").setDescription("Nota 1-5").setRequired(true).setMinValue(1).setMaxValue(5)).addStringOption(o => o.setName("comentario").setDescription("Comentário")),
  new SlashCommandBuilder().setName("avaliacoes").setDescription("📊 Ver avaliações de um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  new SlashCommandBuilder().setName("reputacao").setDescription("🌟 Dar +1 reputação a um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
  new SlashCommandBuilder().setName("perfil").setDescription("👤 Ver perfil completo").addUserOption(o => o.setName("usuario").setDescription("Usuário")),
  new SlashCommandBuilder().setName("nivel").setDescription("📈 Ver seu nível e XP"),
  // Stock
  new SlashCommandBuilder().setName("stock").setDescription("📦 Ver o stock disponível"),
  new SlashCommandBuilder()
    .setName("addstock")
    .setDescription("➕ [Admin] Adicionar item ao stock")
    .addStringOption(o => o.setName("nome").setDescription("Nome do item").setRequired(true))
    .addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade").setRequired(true).setMinValue(1))
    .addIntegerOption(o => o.setName("preco").setDescription("Preço em moedas").setRequired(true).setMinValue(0))
    .addStringOption(o => o.setName("descricao").setDescription("Descrição do item").setRequired(false))
    .addStringOption(o => o.setName("emoji").setDescription("Emoji do item (ex: 🎮)").setRequired(false))
    .addStringOption(o => o.setName("categoria").setDescription("Categoria do item").setRequired(false))
    .addStringOption(o => o.setName("imagem").setDescription("URL da imagem do item").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("removestock")
    .setDescription("➖ [Admin] Remover item do stock")
    .addStringOption(o => o.setName("nome").setDescription("Nome do item").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("editstock")
    .setDescription("✏️ [Admin] Editar preço ou quantidade de um item do stock")
    .addStringOption(o => o.setName("nome").setDescription("Nome do item").setRequired(true))
    .addIntegerOption(o => o.setName("preco").setDescription("Novo preço").setRequired(false))
    .addIntegerOption(o => o.setName("quantidade").setDescription("Nova quantidade").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("setcanal-stock")
    .setDescription("📢 [Admin] Definir canal de notificações de stock")
    .addChannelOption(o => o.setName("canal").setDescription("Canal para notificações").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  // Pagamento
  new SlashCommandBuilder().setName("pagamento").setDescription("💳 Ver informações de pagamento"),
  new SlashCommandBuilder()
    .setName("configurarpagamento")
    .setDescription("⚙️ [Admin] Configurar método de pagamento")
    .addStringOption(o => o.setName("tipo").setDescription("Tipo").setRequired(true).addChoices(
      { name: "PIX", value: "PIX" },
      { name: "Transferência bancária", value: "Transferência bancária" },
      { name: "PayPal", value: "PayPal" },
      { name: "Outro", value: "Outro" },
    ))
    .addStringOption(o => o.setName("chave").setDescription("Chave PIX / e-mail / dados do banco").setRequired(true))
    .addStringOption(o => o.setName("titular").setDescription("Nome do titular").setRequired(true))
    .addStringOption(o => o.setName("info").setDescription("Informações adicionais").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  // Ticket
  new SlashCommandBuilder()
    .setName("configurarticket")
    .setDescription("⚙️ [Admin] Configurar sistema de tickets")
    .addChannelOption(o => o.setName("categoria").setDescription("Categoria onde os tickets serão criados").setRequired(true))
    .addRoleOption(o => o.setName("cargo-suporte").setDescription("Cargo da equipe de suporte").setRequired(true))
    .addChannelOption(o => o.setName("log").setDescription("Canal de logs de tickets fechados").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("painel-ticket")
    .setDescription("🎫 [Admin] Enviar painel de abertura de tickets no canal atual")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Abrir um ticket de suporte"),
  new SlashCommandBuilder().setName("fecharticket").setDescription("🔒 Fechar o ticket atual"),
  new SlashCommandBuilder().setName("assumirticket").setDescription("✋ Assumir o ticket atual (suporte)"),
  new SlashCommandBuilder().setName("adicionarticket").setDescription("➕ Adicionar usuário ao ticket").addUserOption(o => o.setName("usuario").setDescription("Usuário a adicionar").setRequired(true)),
];

// ── Cliente ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

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

// ── Função para criar canal de ticket ────────────────────────────────────────
async function criarCanalTicket(guild, user, assunto, categoria) {
  db.ticketContador++;
  const numero = String(db.ticketContador).padStart(4, "0");
  const nomeCanal = `ticket-${numero}`;

  const permissoes = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
  ];
  for (const cargoId of db.ticketCargos) {
    permissoes.push({ id: cargoId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AttachFiles] });
  }

  const canal = await guild.channels.create({
    name: nomeCanal,
    type: ChannelType.GuildText,
    parent: db.ticketCategoria ?? undefined,
    permissionOverwrites: permissoes,
    topic: `Ticket de ${user.tag} | Categoria: ${categoria} | Assunto: ${assunto}`,
  });

  db.ticketsAbertos[canal.id] = {
    userId: user.id,
    numero,
    claimId: null,
    assunto,
    categoria,
    abertoPor: user.tag,
    abertoEm: new Date().toLocaleString("pt-BR"),
  };

  // Botões dentro do ticket
  const botoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_fechar").setLabel("🔒 Fechar Ticket").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_assumir").setLabel("✋ Assumir").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_transcript").setLabel("📋 Transcript").setStyle(ButtonStyle.Secondary),
  );

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${numero}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "👤 Aberto por", value: `${user}`, inline: true },
      { name: "📂 Categoria", value: categoria, inline: true },
      { name: "📝 Assunto", value: assunto || "Não informado" },
      { name: "🕐 Aberto em", value: new Date().toLocaleString("pt-BR"), inline: true },
      { name: "✋ Atendendo", value: "Aguardando suporte...", inline: true },
    )
    .setFooter({ text: "Use os botões abaixo para gerenciar o ticket." })
    .setTimestamp();

  const mencaoCargos = db.ticketCargos.map(id => `<@&${id}>`).join(" ");
  await canal.send({
    content: `${user} ${mencaoCargos}`,
    embeds: [embed],
    components: [botoes],
  });

  return canal;
}

// ── Função para fechar ticket ────────────────────────────────────────────────
async function fecharTicket(canal, fechadoPor, client) {
  const info = db.ticketsAbertos[canal.id];
  if (!info) return false;

  // Gera transcript
  const transcript = await gerarTranscript(canal);

  // Log no canal de logs
  if (db.ticketLogCanal) {
    try {
      const guild = canal.guild;
      const logCanal = guild.channels.cache.get(db.ticketLogCanal);
      if (logCanal) {
        const logEmbed = new EmbedBuilder()
          .setTitle(`📋 Ticket #${info.numero} Fechado`)
          .setColor(0xff4444)
          .addFields(
            { name: "👤 Aberto por", value: `<@${info.userId}> (${info.abertoPor})`, inline: true },
            { name: "🔒 Fechado por", value: `${fechadoPor}`, inline: true },
            { name: "📂 Categoria", value: info.categoria, inline: true },
            { name: "📝 Assunto", value: info.assunto || "Não informado", inline: true },
            { name: "✋ Atendido por", value: info.claimId ? `<@${info.claimId}>` : "Não atendido", inline: true },
            { name: "🕐 Aberto em", value: info.abertoEm, inline: true },
            { name: "🕐 Fechado em", value: new Date().toLocaleString("pt-BR"), inline: true },
          )
          .setTimestamp();

        // Envia transcript como arquivo
        const { AttachmentBuilder } = await import("discord.js");
        const buf = Buffer.from(transcript, "utf-8");
        const anexo = new AttachmentBuilder(buf, { name: `transcript-ticket-${info.numero}.txt` });
        await logCanal.send({ embeds: [logEmbed], files: [anexo] });
      }
    } catch (err) {
      console.error("❌ Erro ao enviar log:", err.message);
    }
  }

  // DM para o usuário
  try {
    const dono = await client.users.fetch(info.userId);
    await dono.send({
      embeds: [new EmbedBuilder()
        .setTitle(`🔒 Seu Ticket #${info.numero} foi fechado`)
        .setColor(0xff4444)
        .addFields(
          { name: "📂 Categoria", value: info.categoria, inline: true },
          { name: "✋ Atendido por", value: info.claimId ? `<@${info.claimId}>` : "Não atendido", inline: true },
        )
        .setFooter({ text: "Obrigado por entrar em contato!" })
        .setTimestamp()],
    });
  } catch { /* usuário com DMs fechadas */ }

  delete db.ticketsAbertos[canal.id];
  setTimeout(() => canal.delete().catch(() => null), 3000);
  return true;
}

// ── Handler de interações ────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  const user = interaction.user;

  // ── Botões ───────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const { customId } = interaction;

    // Botão abrir ticket no painel
    if (customId === "painel_abrir_ticket") {
      // Verifica ticket já aberto
      const jaAberto = Object.entries(db.ticketsAbertos).find(([, info]) => info.userId === user.id);
      if (jaAberto) {
        const canalExistente = interaction.guild.channels.cache.get(jaAberto[0]);
        return interaction.reply({ content: `❌ Você já tem um ticket aberto em ${canalExistente ?? `#ticket-${jaAberto[1].numero}`}!`, ephemeral: true });
      }

      // Abre modal para categoria + assunto
      const modal = new ModalBuilder()
        .setCustomId("modal_ticket")
        .setTitle("🎫 Abrir Ticket de Suporte");

      const categoriaInput = new TextInputBuilder()
        .setCustomId("ticket_categoria")
        .setLabel("Categoria (ex: Compra, Dúvida, Bug...)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Escreva a categoria do seu ticket")
        .setRequired(true)
        .setMaxLength(50);

      const assuntoInput = new TextInputBuilder()
        .setCustomId("ticket_assunto")
        .setLabel("Descreva brevemente o seu problema")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Ex: Comprei um item e não recebi...")
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(categoriaInput),
        new ActionRowBuilder().addComponents(assuntoInput),
      );

      return interaction.showModal(modal);
    }

    // Botão fechar ticket
    if (customId === "ticket_fechar") {
      const info = db.ticketsAbertos[interaction.channel.id];
      if (!info) return interaction.reply({ content: "❌ Este não é um canal de ticket.", ephemeral: true });

      // Confirma com botões
      const confirmar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_confirmar_fechar").setLabel("✅ Sim, fechar").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket_cancelar_fechar").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("⚠️ Fechar ticket?").setDescription("Tem certeza que deseja fechar este ticket?\nUm transcript será gerado e enviado ao log.").setColor(0xff4444)],
        components: [confirmar],
        ephemeral: true,
      });
    }

    if (customId === "ticket_confirmar_fechar") {
      await interaction.deferUpdate().catch(() => null);
      const fechado = await fecharTicket(interaction.channel, user.tag, client);
      if (!fechado) await interaction.followUp({ content: "❌ Não foi possível fechar o ticket.", ephemeral: true });
      return;
    }

    if (customId === "ticket_cancelar_fechar") {
      return interaction.update({ content: "✅ Fechamento cancelado.", embeds: [], components: [] });
    }

    // Botão assumir ticket
    if (customId === "ticket_assumir") {
      const info = db.ticketsAbertos[interaction.channel.id];
      if (!info) return interaction.reply({ content: "❌ Este não é um canal de ticket.", ephemeral: true });

      if (info.claimId === user.id) return interaction.reply({ content: "❌ Você já está atendendo este ticket!", ephemeral: true });

      info.claimId = user.id;

      // Atualiza embed do ticket
      try {
        const msgs = await interaction.channel.messages.fetch({ limit: 10 });
        const botMsg = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (botMsg) {
          const embedAtualizado = EmbedBuilder.from(botMsg.embeds[0])
            .spliceFields(4, 1, { name: "✋ Atendendo", value: `${user}`, inline: true });
          await botMsg.edit({ embeds: [embedAtualizado] });
        }
      } catch { /* ignora */ }

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("✋ Ticket assumido!").setDescription(`${user} está atendendo este ticket.`).setColor(0x00ff88).setTimestamp()],
      });
    }

    // Botão transcript
    if (customId === "ticket_transcript") {
      const info = db.ticketsAbertos[interaction.channel.id];
      if (!info) return interaction.reply({ content: "❌ Este não é um canal de ticket.", ephemeral: true });

      await interaction.deferReply({ ephemeral: true }).catch(() => null);

      const transcript = await gerarTranscript(interaction.channel);
      const { AttachmentBuilder } = await import("discord.js");
      const buf = Buffer.from(transcript, "utf-8");
      const anexo = new AttachmentBuilder(buf, { name: `transcript-ticket-${info.numero}.txt` });

      return interaction.editReply({ content: "📋 Transcript gerado!", files: [anexo] });
    }

    return;
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "modal_ticket") {
      await interaction.deferReply({ ephemeral: true }).catch(() => null);

      const categoria = interaction.fields.getTextInputValue("ticket_categoria");
      const assunto = interaction.fields.getTextInputValue("ticket_assunto");

      try {
        const canal = await criarCanalTicket(interaction.guild, user, assunto, categoria);
        return interaction.editReply(`✅ Ticket criado em ${canal}!`);
      } catch (err) {
        console.error("❌ Erro ao criar ticket:", err);
        return interaction.editReply("❌ Erro ao criar o ticket. Verifique se o sistema foi configurado com `/configurarticket`.");
      }
    }
    return;
  }

  // ── Slash Commands ───────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  await interaction.deferReply().catch(() => null);

  try {
    // ── Gerais ──────────────────────────────────────────────────────────────
    if (commandName === "ping") {
      const latencia = Date.now() - interaction.createdTimestamp;
      return interaction.editReply(`🏓 Pong! Latência: **${latencia}ms** | API: **${Math.round(client.ws.ping)}ms**`);
    }
    if (commandName === "ajuda") {
      const embed = new EmbedBuilder().setTitle("📋 Comandos disponíveis").setColor(0x5865f2)
        .addFields(
          { name: "🎮 Gerais", value: "/ping • /ajuda • /info • /servidor • /oi • /dado • /cara-ou-coroa" },
          { name: "💰 Economia", value: "/carteira • /loja • /comprar • /inventario • /transferir • /saldo-top • /dar-coins" },
          { name: "📊 Social", value: "/perfil • /nivel • /avaliar • /avaliacoes • /reputacao" },
          { name: "📦 Stock", value: "/stock • /addstock • /editstock • /removestock • /setcanal-stock" },
          { name: "💳 Pagamento", value: "/pagamento • /configurarpagamento" },
          { name: "🎫 Tickets", value: "/ticket • /fecharticket • /assumirticket • /adicionarticket • /painel-ticket • /configurarticket" },
        ).setFooter({ text: "Bot sempre online 24/7 🟢" });
      return interaction.editReply({ embeds: [embed] });
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
      return interaction.editReply({ embeds: [embed] });
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
      return interaction.editReply({ embeds: [embed] });
    }
    if (commandName === "oi") {
      const respostas = [`Salve, ${user.displayName}! 👋`, `Eae ${user.displayName}! 😎`, `Oi ${user.displayName}! 🙌`, `Fala ${user.displayName}! 🤙`];
      return interaction.editReply(respostas[Math.floor(Math.random() * respostas.length)]);
    }
    if (commandName === "dado") return interaction.editReply(`🎲 Você tirou: **${Math.floor(Math.random() * 6) + 1}**`);
    if (commandName === "cara-ou-coroa") return interaction.editReply(Math.random() < 0.5 ? "🪙 **Cara!**" : "🪙 **Coroa!**");

    // ── Economia ────────────────────────────────────────────────────────────
    if (commandName === "loja") {
      const embed = new EmbedBuilder().setTitle("🏪 Loja").setColor(0xffd700)
        .setDescription(LOJA_ITENS.map(i => `${i.nome} — **${i.preco} moedas**\n> ${i.descricao}`).join("\n\n"));
      return interaction.editReply({ embeds: [embed] });
    }
    if (commandName === "comprar") {
      const itemId = interaction.options.getString("item");
      const item = LOJA_ITENS.find(i => i.id === itemId);
      if (!item) return interaction.editReply("❌ Item não encontrado.");
      const saldo = getSaldo(user.id);
      if (saldo < item.preco) return interaction.editReply(`❌ Saldo insuficiente! Você tem **${saldo} moedas**.`);
      setSaldo(user.id, saldo - item.preco);
      getInv(user.id).push({ id: item.id, nome: item.nome });
      addXP(user.id, 20);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✅ Compra realizada!").setColor(0x00ff88)
        .addFields({ name: "Item", value: item.nome, inline: true }, { name: "Pago", value: `${item.preco} moedas`, inline: true }, { name: "Saldo restante", value: `${getSaldo(user.id)} moedas`, inline: true }).setTimestamp()] });
    }
    if (commandName === "inventario") {
      const inv = getInv(user.id);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🎒 Inventário de ${user.username}`).setColor(0x5865f2)
        .setDescription(inv.length ? inv.map(i => `• ${i.nome}`).join("\n") : "Inventário vazio! Use `/loja` para comprar itens.").setTimestamp()] });
    }
    if (commandName === "carteira") {
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`💰 Carteira de ${user.username}`).setColor(0xffd700)
        .addFields({ name: "Saldo", value: `${getSaldo(user.id)} moedas` }).setTimestamp()] });
    }
    if (commandName === "dar-coins") {
      const alvo = interaction.options.getUser("usuario");
      const qtd = interaction.options.getInteger("quantia");
      setSaldo(alvo.id, getSaldo(alvo.id) + qtd);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("💸 Moedas enviadas!").setColor(0x00ff88)
        .addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Quantia", value: `${qtd} moedas`, inline: true }, { name: "Saldo atual", value: `${getSaldo(alvo.id)} moedas`, inline: true }).setTimestamp()] });
    }
    if (commandName === "transferir") {
      const alvo = interaction.options.getUser("usuario");
      const qtd = interaction.options.getInteger("quantia");
      if (alvo.id === user.id) return interaction.editReply("❌ Você não pode transferir para si mesmo!");
      if (getSaldo(user.id) < qtd) return interaction.editReply(`❌ Saldo insuficiente! Você tem **${getSaldo(user.id)} moedas**.`);
      setSaldo(user.id, getSaldo(user.id) - qtd);
      setSaldo(alvo.id, getSaldo(alvo.id) + qtd);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("💳 Transferência realizada!").setColor(0x00ff88)
        .addFields({ name: "Para", value: alvo.username, inline: true }, { name: "Quantia", value: `${qtd} moedas`, inline: true }, { name: "Seu saldo", value: `${getSaldo(user.id)} moedas`, inline: true }).setTimestamp()] });
    }
    if (commandName === "saldo-top") {
      const ranking = Object.entries(db.carteiras).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const desc = ranking.length ? ranking.map(([id, saldo], i) => `**${i + 1}.** <@${id}> — ${saldo} moedas`).join("\n") : "Nenhum usuário ainda.";
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Ranking de Moedas").setColor(0xffd700).setDescription(desc).setTimestamp()] });
    }

    // ── Social ──────────────────────────────────────────────────────────────
    if (commandName === "avaliar") {
      const alvo = interaction.options.getUser("usuario");
      const estrelas = interaction.options.getInteger("estrelas");
      const comentario = interaction.options.getString("comentario") ?? "Sem comentário";
      if (alvo.id === user.id) return interaction.editReply("❌ Você não pode se avaliar!");
      if (!db.avaliacoes[alvo.id]) db.avaliacoes[alvo.id] = [];
      db.avaliacoes[alvo.id].push({ avaliadorTag: user.username, estrelas, comentario, data: new Date().toLocaleDateString("pt-BR") });
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("⭐ Avaliação registrada!").setColor(0xffd700)
        .addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Nota", value: "⭐".repeat(estrelas), inline: true }, { name: "Comentário", value: comentario }).setTimestamp()] });
    }
    if (commandName === "avaliacoes") {
      const alvo = interaction.options.getUser("usuario");
      const avs = db.avaliacoes[alvo.id] ?? [];
      if (!avs.length) return interaction.editReply(`❌ **${alvo.username}** ainda não tem avaliações.`);
      const media = (avs.reduce((a, b) => a + b.estrelas, 0) / avs.length).toFixed(1);
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📊 Avaliações de ${alvo.username}`).setColor(0xffd700)
        .setDescription(avs.slice(-5).map(a => `⭐ ${a.estrelas}/5 — **${a.avaliadorTag}**\n> ${a.comentario}\n> 📅 ${a.data}`).join("\n\n"))
        .addFields({ name: "Média geral", value: `⭐ ${media}/5 (${avs.length} avaliações)` }).setTimestamp()] });
    }
    if (commandName === "reputacao") {
      const alvo = interaction.options.getUser("usuario");
      if (alvo.id === user.id) return interaction.editReply("❌ Você não pode dar reputação para si mesmo!");
      const rep = getRep(alvo.id);
      if (rep.quemDeu.has(user.id)) return interaction.editReply("❌ Você já deu reputação para este usuário!");
      rep.quemDeu.add(user.id);
      rep.total += 1;
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🌟 Reputação adicionada!").setColor(0xffd700)
        .addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Total", value: `${rep.total}`, inline: true }).setTimestamp()] });
    }
    if (commandName === "perfil") {
      const alvo = interaction.options.getUser("usuario") ?? user;
      const rep = getRep(alvo.id);
      const xp = getXP(alvo.id);
      const inv = getInv(alvo.id);
      const avs = db.avaliacoes[alvo.id] ?? [];
      const media = avs.length ? (avs.reduce((a, b) => a + b.estrelas, 0) / avs.length).toFixed(1) : "N/A";
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`👤 Perfil de ${alvo.username}`).setColor(0x5865f2)
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
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📈 Nível de ${user.username}`).setColor(0x5865f2)
        .addFields(
          { name: "Nível", value: `${xp.nivel}`, inline: true },
          { name: "XP", value: `${xp.xp} / ${xpNecessario}`, inline: true },
          { name: "Progresso", value: `[${barra}]` }
        ).setTimestamp()] });
    }

    // ── STOCK ───────────────────────────────────────────────────────────────
    if (commandName === "stock") {
      const itens = db.stock;
      const embed = new EmbedBuilder()
        .setTitle("📦 Stock Disponível")
        .setColor(itens.length > 0 ? 0x00ff88 : 0xff4444)
        .setTimestamp()
        .setFooter({ text: `${itens.length} item(ns) em stock` });

      if (itens.length === 0) {
        embed.setDescription("❌ Sem itens em stock no momento.");
      } else {
        const porCategoria = {};
        for (const i of itens) {
          const cat = i.categoria || "Geral";
          if (!porCategoria[cat]) porCategoria[cat] = [];
          porCategoria[cat].push(i);
        }
        for (const [cat, items] of Object.entries(porCategoria)) {
          embed.addFields({
            name: `📂 ${cat}`,
            value: items.map(i =>
              `${i.emoji || "📦"} **${i.nome}** — 💰 ${i.preco} moedas | 📦 ${i.quantidade} un.\n> ${i.descricao}`
            ).join("\n"),
          });
        }
      }
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === "addstock") {
      const nome = interaction.options.getString("nome");
      const quantidade = interaction.options.getInteger("quantidade");
      const preco = interaction.options.getInteger("preco");
      const descricao = interaction.options.getString("descricao") ?? "Sem descrição";
      const emoji = interaction.options.getString("emoji") ?? "📦";
      const categoria = interaction.options.getString("categoria") ?? "Geral";
      const imagem = interaction.options.getString("imagem") ?? null;

      const existente = db.stock.find(i => i.nome.toLowerCase() === nome.toLowerCase());
      if (existente) {
        existente.quantidade += quantidade;
        if (preco !== null) existente.preco = preco;
        if (imagem) existente.imagem = imagem;
      } else {
        db.stock.push({ id: Date.now().toString(), nome, emoji, quantidade, preco, descricao, categoria, imagem });
      }

      const item = db.stock.find(i => i.nome.toLowerCase() === nome.toLowerCase());
      const embed = new EmbedBuilder()
        .setTitle(`✅ ${existente ? "Stock aumentado!" : "Item adicionado ao stock!"}`)
        .setColor(0x00ff88)
        .addFields(
          { name: "Item", value: `${emoji} ${nome}`, inline: true },
          { name: "Quantidade", value: existente ? `+${quantidade} (Total: ${item.quantidade})` : `${quantidade}`, inline: true },
          { name: "Preço", value: `💰 ${preco} moedas`, inline: true },
          { name: "Categoria", value: categoria, inline: true },
          { name: "Descrição", value: descricao, inline: false },
        )
        .setTimestamp();

      if (imagem) embed.setThumbnail(imagem);

      await interaction.editReply({ embeds: [embed] });
      await notificarStock(client, interaction.guildId);
      return;
    }

    if (commandName === "editstock") {
      const nome = interaction.options.getString("nome");
      const novoPreco = interaction.options.getInteger("preco");
      const novaQtd = interaction.options.getInteger("quantidade");

      const item = db.stock.find(i => i.nome.toLowerCase() === nome.toLowerCase());
      if (!item) return interaction.editReply(`❌ Item **${nome}** não encontrado no stock.`);

      if (novoPreco !== null) item.preco = novoPreco;
      if (novaQtd !== null) item.quantidade = novaQtd;

      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle("✏️ Stock editado!")
        .setColor(0x00ff88)
        .addFields(
          { name: "Item", value: `${item.emoji || "📦"} ${item.nome}`, inline: true },
          { name: "Preço", value: `💰 ${item.preco} moedas`, inline: true },
          { name: "Quantidade", value: `📦 ${item.quantidade} un.`, inline: true },
        ).setTimestamp()] });

      await notificarStock(client, interaction.guildId);
      return;
    }

    if (commandName === "removestock") {
      const nome = interaction.options.getString("nome");
      const idx = db.stock.findIndex(i => i.nome.toLowerCase() === nome.toLowerCase());
      if (idx === -1) return interaction.editReply(`❌ Item **${nome}** não encontrado no stock.`);
      db.stock.splice(idx, 1);
      await interaction.editReply(`✅ Item **${nome}** removido do stock.`);
      await notificarStock(client, interaction.guildId);
      return;
    }

    if (commandName === "setcanal-stock") {
      const canal = interaction.options.getChannel("canal");
      db.canalStock = canal.id;
      return interaction.editReply(`✅ Canal de notificações de stock definido para ${canal}!\nToda vez que o stock for atualizado, uma mensagem será enviada lá automaticamente.`);
    }

    // ── PAGAMENTO ───────────────────────────────────────────────────────────
    if (commandName === "configurarpagamento") {
      const tipo = interaction.options.getString("tipo");
      const chave = interaction.options.getString("chave");
      const titular = interaction.options.getString("titular");
      const info = interaction.options.getString("info") ?? "";
      db.pagamento = { tipo, chave, titular, info };
      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle("✅ Pagamento configurado!").setColor(0x00ff88)
        .addFields(
          { name: "Tipo", value: tipo, inline: true },
          { name: "Titular", value: titular, inline: true },
          { name: "Chave / Dados", value: `\`${chave}\`` },
          ...(info ? [{ name: "Informações adicionais", value: info }] : []),
        ).setTimestamp()] });
    }
    if (commandName === "pagamento") {
      if (!db.pagamento) return interaction.editReply("❌ Nenhum método de pagamento configurado ainda. Use `/configurarpagamento`.");
      const p = db.pagamento;
      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle("💳 Método de Pagamento").setColor(0x5865f2)
        .addFields(
          { name: "Tipo", value: p.tipo, inline: true },
          { name: "Titular", value: p.titular, inline: true },
          { name: "Chave / Dados", value: `\`${p.chave}\`` },
          ...(p.info ? [{ name: "Informações adicionais", value: p.info }] : []),
        ).setTimestamp()] });
    }

    // ── TICKET ──────────────────────────────────────────────────────────────
    if (commandName === "configurarticket") {
      const categoria = interaction.options.getChannel("categoria");
      const cargo = interaction.options.getRole("cargo-suporte");
      const logCanal = interaction.options.getChannel("log");

      db.ticketCategoria = categoria.id;
      db.ticketCargos = [cargo.id];
      if (logCanal) db.ticketLogCanal = logCanal.id;

      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle("✅ Sistema de Tickets Configurado!")
        .setColor(0x00ff88)
        .addFields(
          { name: "📁 Categoria", value: categoria.name, inline: true },
          { name: "👥 Cargo suporte", value: `${cargo}`, inline: true },
          { name: "📋 Canal de log", value: logCanal ? `${logCanal}` : "Não configurado", inline: true },
        )
        .setFooter({ text: "Use /painel-ticket para enviar o painel de abertura!" })
        .setTimestamp()] });
    }

    if (commandName === "painel-ticket") {
      const embed = new EmbedBuilder()
        .setTitle("🎫 Suporte & Atendimento")
        .setDescription(
          "Precisa de ajuda? Clique no botão abaixo para abrir um ticket de suporte.\n\n" +
          "**📌 Antes de abrir:**\n" +
          "• Descreva seu problema com detalhes\n" +
          "• Somente um ticket por vez\n" +
          "• Respeite a equipe de suporte\n\n" +
          "Nossa equipe irá te atender o mais breve possível! 💙"
        )
        .setColor(0x5865f2)
        .setFooter({ text: "Sistema de Tickets • Clique abaixo para abrir" })
        .setTimestamp();

      const botao = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("painel_abrir_ticket")
          .setLabel("🎫 Abrir Ticket")
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.channel.send({ embeds: [embed], components: [botao] });
      return interaction.editReply({ content: "✅ Painel enviado!", ephemeral: true }).catch(() => interaction.editReply("✅ Painel enviado!"));
    }

    if (commandName === "ticket") {
      const jaAberto = Object.entries(db.ticketsAbertos).find(([, info]) => info.userId === user.id);
      if (jaAberto) {
        const canalExistente = interaction.guild.channels.cache.get(jaAberto[0]);
        return interaction.editReply(`❌ Você já tem um ticket aberto em ${canalExistente ?? `#ticket-${jaAberto[1].numero}`}!`);
      }
      try {
        const canal = await criarCanalTicket(interaction.guild, user, "Aberto via comando", "Geral");
        return interaction.editReply(`✅ Ticket criado em ${canal}!`);
      } catch (err) {
        console.error("❌ Erro ao criar ticket:", err);
        return interaction.editReply("❌ Erro ao criar o ticket. Configure o sistema com `/configurarticket`.");
      }
    }

    if (commandName === "fecharticket") {
      const info = db.ticketsAbertos[interaction.channel.id];
      if (!info) return interaction.editReply("❌ Este comando só pode ser usado dentro de um ticket!");
      await interaction.editReply("🔒 Fechando ticket...");
      await fecharTicket(interaction.channel, user.tag, client);
      return;
    }

    if (commandName === "assumirticket") {
      const info = db.ticketsAbertos[interaction.channel.id];
      if (!info) return interaction.editReply("❌ Este comando só pode ser usado dentro de um ticket!");
      info.claimId = user.id;
      return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✋ Ticket assumido!").setDescription(`${user} está atendendo este ticket.`).setColor(0x00ff88).setTimestamp()] });
    }

    if (commandName === "adicionarticket") {
      const info = db.ticketsAbertos[interaction.channel.id];
      if (!info) return interaction.editReply("❌ Este comando só pode ser usado dentro de um ticket!");
      const alvo = interaction.options.getUser("usuario");
      await interaction.channel.permissionOverwrites.edit(alvo.id, {
        [PermissionsBitField.Flags.ViewChannel]: true,
        [PermissionsBitField.Flags.SendMessages]: true,
        [PermissionsBitField.Flags.ReadMessageHistory]: true,
      });
      return interaction.editReply(`✅ ${alvo} foi adicionado ao ticket!`);
    }

  } catch (err) {
    console.error(`❌ Erro no comando /${commandName}:`, err);
    await interaction.editReply("❌ Ocorreu um erro ao executar este comando.").catch(() => null);
  }
});

// ── Anti-crash global ────────────────────────────────────────────────────────
process.on("unhandledRejection", (err) => console.error("❌ UnhandledRejection:", err));
process.on("uncaughtException",  (err) => console.error("❌ UncaughtException:", err));
client.on("error", (err) => console.error("❌ Erro no client:", err));
client.on("shardDisconnect", () => { console.warn("⚠️ Shard desconectado. Reconectando..."); });

client.login(token);
