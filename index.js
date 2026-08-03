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
} from "discord.js";

const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("❌ Token não encontrado!"); process.exit(1); }

const db = {
carteiras: {}, inventarios: {}, avaliacoes: {}, reputacoes: {}, xp: {},
stock: [], canalStock: null, pagamento: null,
ticketCategoria: null, ticketCargos: [], ticketLogCanal: null, ticketContador: 0, ticketsAbertos: {},
};

const LOJA_ITENS = [
{ id: "espada", nome: "⚔️ Espada", preco: 500, descricao: "Uma espada poderosa" },
{ id: "escudo", nome: "🛡️ Escudo", preco: 400, descricao: "Proteção máxima" },
{ id: "pocao", nome: "🧪 Poção", preco: 150, descricao: "Recupera sua energia" },
{ id: "arco", nome: "🏹 Arco", preco: 350, descricao: "Ataque à distância" },
{ id: "anel", nome: "💍 Anel Mágico", preco: 800, descricao: "Aumenta seu poder" },
{ id: "chapeu", nome: "🎩 Chapéu VIP", preco: 1000, descricao: "Item exclusivo VIP" },
];

function getSaldo(id) { if (!db.carteiras[id]) db.carteiras[id] = 500; return db.carteiras[id]; }
function setSaldo(id, v) { db.carteiras[id] = Math.max(0, v); }
function getInv(id) { if (!db.inventarios[id]) db.inventarios[id] = []; return db.inventarios[id]; }
function getXP(id) { if (!db.xp[id]) db.xp[id] = { xp: 0, nivel: 1 }; return db.xp[id]; }
function addXP(id, qtd) { const u = getXP(id); u.xp += qtd; const xpN = u.nivel * 100; if (u.xp >= xpN) { u.xp -= xpN; u.nivel++; } }
function getRep(id) { if (!db.reputacoes[id]) db.reputacoes[id] = { total: 0, quemDeu: new Set() }; return db.reputacoes[id]; }

async function notificarStock(client, guildId) {
if (!db.canalStock) return;
try {
const canal = client.guilds.cache.get(guildId)?.channels.cache.get(db.canalStock);
if (!canal) return;
const embed = new EmbedBuilder().setTitle("📦 Stock Atualizado").setColor(db.stock.length > 0 ? 0x00ff88 : 0xff4444).setTimestamp().setFooter({ text: "Atualização automática de stock" });
if (db.stock.length === 0) { embed.setDescription("❌ Sem itens em stock no momento."); }
else {
const por = {};
for (const i of db.stock) { const c = i.categoria || "Geral"; if (!por[c]) por[c] = []; por[c].push(i); }
}for (const [cat, items] of Object.entries(por)) {
  embed.addFields({
    name: `📂 ${cat}`,
    value: items
      .map(i => `${i.emoji || "📦"} **${i.nome}** — 💰 ${i.preco} moedas | 📦 ${i.quantidade} un.\n> ${i.descricao}`)
      .join("\n")
  });
}

await canal.send({ embeds: [embed] });
} catch (err) {
  console.error("❌ Erro ao notificar stock:", err.message);
}

const commands = [
new SlashCommandBuilder().setName("ping").setDescription("🏓 Verifica a latência do bot"),
new SlashCommandBuilder().setName("ajuda").setDescription("📋 Lista todos os comandos"),
new SlashCommandBuilder().setName("info").setDescription("ℹ️ Informações sobre um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário")),
new SlashCommandBuilder().setName("servidor").setDescription("🌐 Informações do servidor"),
new SlashCommandBuilder().setName("oi").setDescription("👋 O bot te manda um salve!"),
new SlashCommandBuilder().setName("dado").setDescription("🎲 Joga um dado de 6 faces"),
new SlashCommandBuilder().setName("cara-ou-coroa").setDescription("🪙 Joga uma moeda"),
new SlashCommandBuilder().setName("loja").setDescription("🏪 Ver os itens da loja"),
new SlashCommandBuilder().setName("comprar").setDescription("🛒 Comprar um item da loja").addStringOption(o => o.setName("item").setDescription("Item").setRequired(true).addChoices(...LOJA_ITENS.map(i => ({ name: i.nome, value: i.id })))),
new SlashCommandBuilder().setName("inventario").setDescription("🎒 Ver seu inventário"),
new SlashCommandBuilder().setName("carteira").setDescription("💰 Ver seu saldo"),
new SlashCommandBuilder().setName("dar-coins").setDescription("💸 [Admin] Dar moedas").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setRequired(true).setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("transferir").setDescription("💳 Transferir moedas").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setRequired(true).setMinValue(1)),
new SlashCommandBuilder().setName("saldo-top").setDescription("🏆 Ranking dos mais ricos"),
new SlashCommandBuilder().setName("avaliar").setDescription("⭐ Avaliar um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("estrelas").setDescription("Nota 1-5").setRequired(true).setMinValue(1).setMaxValue(5)).addStringOption(o => o.setName("comentario").setDescription("Comentário")),
new SlashCommandBuilder().setName("avaliacoes").setDescription("📊 Ver avaliações de um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
new SlashCommandBuilder().setName("reputacao").setDescription("🌟 Dar +1 reputação a um usuário").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
new SlashCommandBuilder().setName("perfil").setDescription("👤 Ver perfil completo").addUserOption(o => o.setName("usuario").setDescription("Usuário")),
new SlashCommandBuilder().setName("nivel").setDescription("📈 Ver seu nível e XP"),
new SlashCommandBuilder().setName("stock").setDescription("📦 Ver o stock disponível"),
new SlashCommandBuilder().setName("addstock").setDescription("➕ [Admin] Adicionar item ao stock").addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true)).addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade").setRequired(true).setMinValue(1)).addIntegerOption(o => o.setName("preco").setDescription("Preço").setRequired(true).setMinValue(0)).addStringOption(o => o.setName("descricao").setDescription("Descrição")).addStringOption(o => o.setName("emoji").setDescription("Emoji")).addStringOption(o => o.setName("categoria").setDescription("Categoria")).addStringOption(o => o.setName("imagem").setDescription("URL da imagem")).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("removestock").setDescription("➖ [Admin] Remover item do stock").addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("editstock").setDescription("✏️ [Admin] Editar item do stock").addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true)).addIntegerOption(o => o.setName("preco").setDescription("Novo preço")).addIntegerOption(o => o.setName("quantidade").setDescription("Nova quantidade")).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("setcanal-stock").setDescription("📢 [Admin] Definir canal de notificações de stock").addChannelOption(o => o.setName("canal").setDescription("Canal").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("pagamento").setDescription("💳 Ver informações de pagamento"),
new SlashCommandBuilder().setName("configurarpagamento").setDescription("⚙️ [Admin] Configurar pagamento").addStringOption(o => o.setName("tipo").setDescription("Tipo").setRequired(true).addChoices({ name: "PIX", value: "PIX" }, { name: "Transferência bancária", value: "Transferência bancária" }, { name: "PayPal", value: "PayPal" }, { name: "Outro", value: "Outro" })).addStringOption(o => o.setName("chave").setDescription("Chave/dados").setRequired(true)).addStringOption(o => o.setName("titular").setDescription("Titular").setRequired(true)).addStringOption(o => o.setName("info").setDescription("Info adicional")).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("configurarticket").setDescription("⚙️ [Admin] Configurar tickets").addChannelOption(o => o.setName("categoria").setDescription("Categoria").setRequired(true)).addRoleOption(o => o.setName("cargo-suporte").setDescription("Cargo suporte").setRequired(true)).addChannelOption(o => o.setName("log").setDescription("Canal de log")).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("painel-ticket").setDescription("🎫 [Admin] Enviar painel de tickets").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
new SlashCommandBuilder().setName("ticket").setDescription("🎫 Abrir um ticket de suporte"),
new SlashCommandBuilder().setName("fecharticket").setDescription("🔒 Fechar o ticket atual"),
new SlashCommandBuilder().setName("assumirticket").setDescription("✋ Assumir o ticket atual"),
new SlashCommandBuilder().setName("adicionarticket").setDescription("➕ Adicionar usuário ao ticket").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)),
];
client.once("ready", async (c) => {
console.log(`✅ Bot online! Logado como: ${c.user.tag}`);
c.user.setPresence({ status: "online", activities: [{ name: "Online 🟢", type: ActivityType.Custom }] });
try {
const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationCommands(c.user.id), { body: commands.map(cmd => cmd.toJSON()) });
} catch (err) { console.error("❌ Erro ao registrar comandos:", err); }
});
console.log(✅ ${commands.length} comandos registrados!);

async function criarCanalTicket(guild, user, assunto, categoria) {
db.ticketContador++;
const numero = String(db.ticketContador).padStart(4, "0");
const permissoes = [
{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
{ id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles] },
];
for (const cargoId of db.ticketCargos) permissoes.push({ id: cargoId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AttachFiles] });
const canal = await guild.channels.create({ name: ticket-${numero}, type: ChannelType.GuildText, parent: db.ticketCategoria ?? undefined, permissionOverwrites: permissoes, topic: Ticket de ${user.tag} | Categoria: ${categoria} });
db.ticketsAbertos[canal.id] = { userId: user.id, numero, claimId: null, assunto, categoria, abertoPor: user.tag, abertoEm: new Date().toLocaleString("pt-BR") };
const botoes = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("ticket_fechar").setLabel("🔒 Fechar Ticket").setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId("ticket_assumir").setLabel("✋ Assumir").setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId("ticket_transcript").setLabel("📋 Transcript").setStyle(ButtonStyle.Secondary),
);
const embed = new EmbedBuilder().setTitle(🎫 Ticket #${numero}).setColor(0x5865f2)
.addFields({ name: "👤 Aberto por", value: ${user}, inline: true }, { name: "📂 Categoria", value: categoria, inline: true }, { name: "📝 Assunto", value: assunto || "Não informado" }, { name: "✋ Atendendo", value: "Aguardando suporte...", inline: true })
.setFooter({ text: "Use os botões abaixo para gerenciar o ticket." }).setTimestamp();
await canal.send({ content: ${user} ${db.ticketCargos.map(id => <@&${id}>).join(" ")}, embeds: [embed], components: [botoes] });
return canal;
}

async function fecharTicket(canal, fechadoPor, client) {
const info = db.ticketsAbertos[canal.id];
if (!info) return false;
const transcript = await gerarTranscript(canal);
if (db.ticketLogCanal) {
try {
const logCanal = canal.guild.channels.cache.get(db.ticketLogCanal);
if (logCanal) {
const { AttachmentBuilder } = await import("discord.js");
const logEmbed = new EmbedBuilder().setTitle(📋 Ticket #${info.numero} Fechado).setColor(0xff4444)
.addFields({ name: "👤 Aberto por", value: <@${info.userId}>, inline: true }, { name: "🔒 Fechado por", value: fechadoPor, inline: true }, { name: "✋ Atendido por", value: info.claimId ? <@${info.claimId}> : "Não atendido", inline: true }).setTimestamp();
await logCanal.send({ embeds: [logEmbed], files: [new AttachmentBuilder(Buffer.from(transcript, "utf-8"), { name: transcript-ticket-${info.numero}.txt })] });
}
} catch (err) { console.error("❌ Erro ao enviar log:", err.message); }
}
try { const dono = await client.users.fetch(info.userId); await dono.send({ embeds: [new EmbedBuilder().setTitle(🔒 Seu Ticket #${info.numero} foi fechado).setColor(0xff4444).setFooter({ text: "Obrigado por entrar em contato!" }).setTimestamp()] }); } catch { }
delete db.ticketsAbertos[canal.id];
setTimeout(() => canal.delete().catch(() => null), 3000);
return true;
}

client.on("interactionCreate", async (interaction) => {
const user = interaction.user;

if (interaction.isButton()) {
const { customId } = interaction;
if (customId === "painel_abrir_ticket") {
const jaAberto = Object.entries(db.ticketsAbertos).find(([, i]) => i.userId === user.id);
if (jaAberto) return interaction.reply({ content: ❌ Você já tem um ticket aberto!, ephemeral: true });
const modal = new ModalBuilder().setCustomId("modal_ticket").setTitle("🎫 Abrir Ticket de Suporte");
modal.addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_categoria").setLabel("Categoria (ex: Compra, Dúvida, Bug...)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ticket_assunto").setLabel("Descreva brevemente o seu problema").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
);
return interaction.showModal(modal);
}
if (customId === "ticket_fechar") {
if (!db.ticketsAbertos[interaction.channel.id]) return interaction.reply({ content: "❌ Este não é um canal de ticket.", ephemeral: true });
const confirmar = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("ticket_confirmar_fechar").setLabel("✅ Sim, fechar").setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId("ticket_cancelar_fechar").setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary),
);
return interaction.reply({ embeds: [new EmbedBuilder().setTitle("⚠️ Fechar ticket?").setDescription("Tem certeza que deseja fechar este ticket?").setColor(0xff4444)], components: [confirmar], ephemeral: true });
}
if (customId === "ticket_confirmar_fechar") {
await interaction.deferUpdate().catch(() => null);
await fecharTicket(interaction.channel, user.tag, client);
return;
}
if (customId === "ticket_cancelar_fechar") return interaction.update({ content: "✅ Fechamento cancelado.", embeds: [], components: [] });
if (customId === "ticket_assumir") {
const info = db.ticketsAbertos[interaction.channel.id];
if (!info) return interaction.reply({ content: "❌ Este não é um canal de ticket.", ephemeral: true });
info.claimId = user.id;
return interaction.reply({ embeds: [new EmbedBuilder().setTitle("✋ Ticket assumido!").setDescription(${user} está atendendo este ticket.).setColor(0x00ff88).setTimestamp()] });
}
if (customId === "ticket_transcript") {
const info = db.ticketsAbertos[interaction.channel.id];
if (!info) return interaction.reply({ content: "❌ Este não é um canal de ticket.", ephemeral: true });
await interaction.deferReply({ ephemeral: true }).catch(() => null);
const { AttachmentBuilder } = await import("discord.js");
const transcript = await gerarTranscript(interaction.channel);
return interaction.editReply({ content: "📋 Transcript gerado!", files: [new AttachmentBuilder(Buffer.from(transcript, "utf-8"), { name: transcript-ticket-${info.numero}.txt })] });
}
return;
}

if (interaction.isModalSubmit() && interaction.customId === "modal_ticket") {
await interaction.deferReply({ ephemeral: true }).catch(() => null);
try {
const canal = await criarCanalTicket(interaction.guild, user, interaction.fields.getTextInputValue("ticket_assunto"), interaction.fields.getTextInputValue("ticket_categoria"));
return interaction.editReply(✅ Ticket criado em ${canal}!);
} catch (err) { return interaction.editReply("❌ Erro ao criar o ticket. Configure com /configurarticket."); }
}

if (!interaction.isChatInputCommand()) return;
const { commandName } = interaction;
await interaction.deferReply().catch(() => null);

try {
if (commandName === "ping") return interaction.editReply(🏓 Pong! Latência: **${Date.now() - interaction.createdTimestamp}ms** | API: **${Math.round(client.ws.ping)}ms**);
if (commandName === "ajuda") return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("📋 Comandos disponíveis").setColor(0x5865f2).addFields({ name: "🎮 Gerais", value: "/ping • /ajuda • /info • /servidor • /oi • /dado • /cara-ou-coroa" }, { name: "💰 Economia", value: "/carteira • /loja • /comprar • /inventario • /transferir • /saldo-top • /dar-coins" }, { name: "📊 Social", value: "/perfil • /nivel • /avaliar • /avaliacoes • /reputacao" }, { name: "📦 Stock", value: "/stock • /addstock • /editstock • /removestock • /setcanal-stock" }, { name: "💳 Pagamento", value: "/pagamento • /configurarpagamento" }, { name: "🎫 Tickets", value: "/ticket • /fecharticket • /assumirticket • /adicionarticket • /painel-ticket • /configurarticket" }).setFooter({ text: "Bot sempre online 24/7 🟢" })] });
if (commandName === "info") { const alvo = interaction.options.getUser("usuario") ?? user; const member = interaction.guild?.members.cache.get(alvo.id); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(ℹ️ ${alvo.username}).setColor(0x5865f2).setThumbnail(alvo.displayAvatarURL()).addFields({ name: "ID", value: alvo.id, inline: true }, { name: "Conta criada", value: alvo.createdAt.toLocaleDateString("pt-BR"), inline: true }, { name: "Entrou no servidor", value: member?.joinedAt?.toLocaleDateString("pt-BR") ?? "N/A", inline: true }).setTimestamp()] }); }
if (commandName === "servidor") { const g = interaction.guild; return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(🌐 ${g.name}).setColor(0x5865f2).setThumbnail(g.iconURL()).addFields({ name: "Membros", value: ${g.memberCount}, inline: true }, { name: "Criado em", value: g.createdAt.toLocaleDateString("pt-BR"), inline: true }, { name: "Dono", value: <@${g.ownerId}>, inline: true }).setTimestamp()] }); }
if (commandName === "oi") { const r = [Salve, ${user.displayName}! 👋, Eae ${user.displayName}! 😎, Oi ${user.displayName}! 🙌, Fala ${user.displayName}! 🤙]; return interaction.editReply(r[Math.floor(Math.random() * r.length)]); }
if (commandName === "dado") return interaction.editReply(🎲 Você tirou: **${Math.floor(Math.random() * 6) + 1}**);
if (commandName === "cara-ou-coroa") return interaction.editReply(Math.random() < 0.5 ? "🪙 Cara!" : "🪙 Coroa!");
if (commandName === "loja") return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🏪 Loja").setColor(0xffd700).setDescription(LOJA_ITENS.map(i => ${i.nome} — **${i.preco} moedas**\n> ${i.descricao}).join("\n\n"))] });
if (commandName === "comprar") { const item = LOJA_ITENS.find(i => i.id === interaction.options.getString("item")); if (!item) return interaction.editReply("❌ Item não encontrado."); if (getSaldo(user.id) < item.preco) return interaction.editReply(❌ Saldo insuficiente! Você tem **${getSaldo(user.id)} moedas**.); setSaldo(user.id, getSaldo(user.id) - item.preco); getInv(user.id).push({ id: item.id, nome: item.nome }); addXP(user.id, 20); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✅ Compra realizada!").setColor(0x00ff88).addFields({ name: "Item", value: item.nome, inline: true }, { name: "Pago", value: ${item.preco} moedas, inline: true }, { name: "Saldo restante", value: ${getSaldo(user.id)} moedas, inline: true }).setTimestamp()] }); }
if (commandName === "inventario") return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(🎒 Inventário de ${user.username}).setColor(0x5865f2).setDescription(getInv(user.id).length ? getInv(user.id).map(i => • ${i.nome}).join("\n") : "Inventário vazio! Use /loja para comprar itens.").setTimestamp()] });
if (commandName === "carteira") return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(💰 Carteira de ${user.username}).setColor(0xffd700).addFields({ name: "Saldo", value: ${getSaldo(user.id)} moedas }).setTimestamp()] });
if (commandName === "dar-coins") { const alvo = interaction.options.getUser("usuario"); const qtd = interaction.options.getInteger("quantia"); setSaldo(alvo.id, getSaldo(alvo.id) + qtd); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("💸 Moedas enviadas!").setColor(0x00ff88).addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Quantia", value: ${qtd} moedas, inline: true }, { name: "Saldo atual", value: ${getSaldo(alvo.id)} moedas, inline: true }).setTimestamp()] }); }
if (commandName === "transferir") { const alvo = interaction.options.getUser("usuario"); const qtd = interaction.options.getInteger("quantia"); if (alvo.id === user.id) return interaction.editReply("❌ Você não pode transferir para si mesmo!"); if (getSaldo(user.id) < qtd) return interaction.editReply(❌ Saldo insuficiente!); setSaldo(user.id, getSaldo(user.id) - qtd); setSaldo(alvo.id, getSaldo(alvo.id) + qtd); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("💳 Transferência realizada!").setColor(0x00ff88).addFields({ name: "Para", value: alvo.username, inline: true }, { name: "Quantia", value: ${qtd} moedas, inline: true }, { name: "Seu saldo", value: ${getSaldo(user.id)} moedas, inline: true }).setTimestamp()] }); }
if (commandName === "saldo-top") { const r = Object.entries(db.carteiras).sort((a, b) => b[1] - a[1]).slice(0, 10); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Ranking de Moedas").setColor(0xffd700).setDescription(r.length ? r.map(([id, s], i) => **${i + 1}.** <@${id}> — ${s} moedas).join("\n") : "Nenhum usuário ainda.").setTimestamp()] }); }
if (commandName === "avaliar") { const alvo = interaction.options.getUser("usuario"); if (alvo.id === user.id) return interaction.editReply("❌ Você não pode se avaliar!"); if (!db.avaliacoes[alvo.id]) db.avaliacoes[alvo.id] = []; db.avaliacoes[alvo.id].push({ avaliadorTag: user.username, estrelas: interaction.options.getInteger("estrelas"), comentario: interaction.options.getString("comentario") ?? "Sem comentário", data: new Date().toLocaleDateString("pt-BR") }); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("⭐ Avaliação registrada!").setColor(0xffd700).addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Nota", value: "⭐".repeat(interaction.options.getInteger("estrelas")), inline: true }).setTimestamp()] }); }
if (commandName === "avaliacoes") { const alvo = interaction.options.getUser("usuario"); const avs = db.avaliacoes[alvo.id] ?? []; if (!avs.length) return interaction.editReply(❌ **${alvo.username}** ainda não tem avaliações.); const media = (avs.reduce((a, b) => a + b.estrelas, 0) / avs.length).toFixed(1); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(📊 Avaliações de ${alvo.username}).setColor(0xffd700).setDescription(avs.slice(-5).map(a => ⭐ ${a.estrelas}/5 — **${a.avaliadorTag}**\n> ${a.comentario}).join("\n\n")).addFields({ name: "Média geral", value: ⭐ ${media}/5 (${avs.length} avaliações) }).setTimestamp()] }); }
if (commandName === "reputacao") { const alvo = interaction.options.getUser("usuario"); if (alvo.id === user.id) return interaction.editReply("❌ Você não pode dar reputação para si mesmo!"); const rep = getRep(alvo.id); if (rep.quemDeu.has(user.id)) return interaction.editReply("❌ Você já deu reputação para este usuário!"); rep.quemDeu.add(user.id); rep.total++; return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🌟 Reputação adicionada!").setColor(0xffd700).addFields({ name: "Usuário", value: alvo.username, inline: true }, { name: "Total", value: ${rep.total}, inline: true }).setTimestamp()] }); }
if (commandName === "perfil") { const alvo = interaction.options.getUser("usuario") ?? user; const rep = getRep(alvo.id); const xp = getXP(alvo.id); const avs = db.avaliacoes[alvo.id] ?? []; const media = avs.length ? (avs.reduce((a, b) => a + b.estrelas, 0) / avs.length).toFixed(1) : "N/A"; return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(👤 Perfil de ${alvo.username}).setColor(0x5865f2).setThumbnail(alvo.displayAvatarURL()).addFields({ name: "💰 Saldo", value: ${getSaldo(alvo.id)} moedas, inline: true }, { name: "🌟 Reputação", value: ${rep.total}, inline: true }, { name: "📈 Nível", value: ${xp.nivel} (${xp.xp} XP), inline: true }, { name: "🎒 Itens", value: ${getInv(alvo.id).length}, inline: true }, { name: "⭐ Avaliação", value: media !== "N/A" ? ${media}/5 : "Sem avaliações", inline: true }).setTimestamp()] }); }
if (commandName === "nivel") { const xp = getXP(user.id); const xpN = xp.nivel * 100; const p = Math.floor((xp.xp / xpN) * 10); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(📈 Nível de ${user.username}).setColor(0x5865f2).addFields({ name: "Nível", value: ${xp.nivel}, inline: true }, { name: "XP", value: ${xp.xp} / ${xpN}, inline: true }, { name: "Progresso", value: [${"█".repeat(p)}${"░".repeat(10 - p)}] }).setTimestamp()] }); }
if (commandName === "stock") { const itens = db.stock; const embed = new EmbedBuilder().setTitle("📦 Stock Disponível").setColor(itens.length > 0 ? 0x00ff88 : 0xff4444).setTimestamp().setFooter({ text: ${itens.length} item(ns) em stock }); if (!itens.length) { embed.setDescription("❌ Sem itens em stock no momento."); } else { const por = {}; for (const i of itens) { const c = i.categoria || "Geral"; if (!por[c]) por[c] = []; por[c].push(i); } for (const [cat, items] of Object.entries(por)) embed.addFields({ name: 📂 ${cat}, value: items.map(i => ${i.emoji || "📦"} **${i.nome}** — 💰 ${i.preco} moedas | 📦 ${i.quantidade} un.\n> ${i.descricao}).join("\n") }); } return interaction.editReply({ embeds: [embed] }); }
if (commandName === "addstock") { const nome = interaction.options.getString("nome"); const qtd = interaction.options.getInteger("quantidade"); const preco = interaction.options.getInteger("preco"); const descricao = interaction.options.getString("descricao") ?? "Sem descrição"; const emoji = interaction.options.getString("emoji") ?? "📦"; const categoria = interaction.options.getString("categoria") ?? "Geral"; const imagem = interaction.options.getString("imagem"); const ex = db.stock.find(i => i.nome.toLowerCase() === nome.toLowerCase()); if (ex) { ex.quantidade += qtd; if (preco !== null) ex.preco = preco; } else { db.stock.push({ id: Date.now().toString(), nome, emoji, quantidade: qtd, preco, descricao, categoria, imagem }); } const item = db.stock.find(i => i.nome.toLowerCase() === nome.toLowerCase()); const embed = new EmbedBuilder().setTitle(✅ ${ex ? "Stock aumentado!" : "Item adicionado!"}).setColor(0x00ff88).addFields({ name: "Item", value: ${emoji} ${nome}, inline: true }, { name: "Quantidade", value: ex ? +${qtd} (Total: ${item.quantidade}) : ${qtd}, inline: true }, { name: "Preço", value: 💰 ${preco} moedas, inline: true }, { name: "Categoria", value: categoria, inline: true }, { name: "Descrição", value: descricao }).setTimestamp(); if (imagem) embed.setThumbnail(imagem); await interaction.editReply({ embeds: [embed] }); await notificarStock(client, interaction.guildId); return; }
if (commandName === "editstock") { const nome = interaction.options.getString("nome"); const item = db.stock.find(i => i.nome.toLowerCase() === nome.toLowerCase()); if (!item) return interaction.editReply(❌ Item **${nome}** não encontrado.); const np = interaction.options.getInteger("preco"); const nq = interaction.options.getInteger("quantidade"); if (np !== null) item.preco = np; if (nq !== null) item.quantidade = nq; await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✏️ Stock editado!").setColor(0x00ff88).addFields({ name: "Item", value: ${item.emoji || "📦"} ${item.nome}, inline: true }, { name: "Preço", value: 💰 ${item.preco} moedas, inline: true }, { name: "Quantidade", value: 📦 ${item.quantidade} un., inline: true }).setTimestamp()] }); await notificarStock(client, interaction.guildId); return; }
if (commandName === "removestock") { const nome = interaction.options.getString("nome"); const idx = db.stock.findIndex(i => i.nome.toLowerCase() === nome.toLowerCase()); if (idx === -1) return interaction.editReply(❌ Item **${nome}** não encontrado.); db.stock.splice(idx, 1); await interaction.editReply(✅ Item **${nome}** removido do stock.); await notificarStock(client, interaction.guildId); return; }
if (commandName === "setcanal-stock") { const canal = interaction.options.getChannel("canal"); db.canalStock = canal.id; return interaction.editReply(✅ Canal de notificações definido para ${canal}!); }
if (commandName === "configurarpagamento") { db.pagamento = { tipo: interaction.options.getString("tipo"), chave: interaction.options.getString("chave"), titular: interaction.options.getString("titular"), info: interaction.options.getString("info") ?? "" }; return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✅ Pagamento configurado!").setColor(0x00ff88).addFields({ name: "Tipo", value: db.pagamento.tipo, inline: true }, { name: "Titular", value: db.pagamento.titular, inline: true }, { name: "Chave / Dados", value: \${db.pagamento.chave}`}).setTimestamp()] }); }   if (commandName === "pagamento") { if (!db.pagamento) return interaction.editReply("❌ Nenhum método configurado. Use/configurarpagamento."); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("💳 Método de Pagamento").setColor(0x5865f2).addFields({ name: "Tipo", value: db.pagamento.tipo, inline: true }, { name: "Titular", value: db.pagamento.titular, inline: true }, { name: "Chave / Dados", value: `${db.pagamento.chave}`}, ...(db.pagamento.info ? [{ name: "Info adicional", value: db.pagamento.info }] : [])).setTimestamp()] }); }   if (commandName === "configurarticket") { const categoria = interaction.options.getChannel("categoria"); const cargo = interaction.options.getRole("cargo-suporte"); const logCanal = interaction.options.getChannel("log"); db.ticketCategoria = categoria.id; db.ticketCargos = [cargo.id]; if (logCanal) db.ticketLogCanal = logCanal.id; return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✅ Sistema de Tickets Configurado!").setColor(0x00ff88).addFields({ name: "📁 Categoria", value: categoria.name, inline: true }, { name: "👥 Cargo suporte", value:${cargo}, inline: true }, { name: "📋 Canal de log", value: logCanal ? ${logCanal} : "Não configurado", inline: true }).setFooter({ text: "Use /painel-ticket para enviar o painel!" }).setTimestamp()] }); }   if (commandName === "painel-ticket") { const embed = new EmbedBuilder().setTitle("🎫 Suporte & Atendimento").setDescription("Precisa de ajuda? Clique no botão abaixo para abrir um ticket.\n\n**📌 Antes de abrir:**\n• Descreva seu problema com detalhes\n• Somente um ticket por vez\n• Respeite a equipe de suporte").setColor(0x5865f2).setFooter({ text: "Clique abaixo para abrir um ticket" }).setTimestamp(); await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("painel_abrir_ticket").setLabel("🎫 Abrir Ticket").setStyle(ButtonStyle.Primary))] }); return interaction.editReply({ content: "✅ Painel enviado!" }); }   if (commandName === "ticket") { const jaAberto = Object.entries(db.ticketsAbertos).find(([, i]) => i.userId === user.id); if (jaAberto) return interaction.editReply(❌ Você já tem um ticket aberto!); try { const canal = await criarCanalTicket(interaction.guild, user, "Aberto via comando", "Geral"); return interaction.editReply(✅ Ticket criado em ${canal}!); } catch (err) { return interaction.editReply("❌ Erro ao criar o ticket. Configure com /configurarticket."); } }   if (commandName === "fecharticket") { if (!db.ticketsAbertos[interaction.channel.id]) return interaction.editReply("❌ Este comando só pode ser usado dentro de um ticket!"); await interaction.editReply("🔒 Fechando ticket..."); await fecharTicket(interaction.channel, user.tag, client); return; }   if (commandName === "assumirticket") { const info = db.ticketsAbertos[interaction.channel.id]; if (!info) return interaction.editReply("❌ Este comando só pode ser usado dentro de um ticket!"); info.claimId = user.id; return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("✋ Ticket assumido!").setDescription(${user} está atendendo este ticket.).setColor(0x00ff88).setTimestamp()] }); }   if (commandName === "adicionarticket") { if (!db.ticketsAbertos[interaction.channel.id]) return interaction.editReply("❌ Este comando só pode ser usado dentro de um ticket!"); const alvo = interaction.options.getUser("usuario"); await interaction.channel.permissionOverwrites.edit(alvo.id, { [PermissionsBitField.Flags.ViewChannel]: true, [PermissionsBitField.Flags.SendMessages]: true, [PermissionsBitField.Flags.ReadMessageHistory]: true }); return interaction.editReply(✅ ${alvo} foi adicionado ao ticket!); }   } catch (err) {   console.error(❌ Erro no comando /${commandName}:`, err);
await interaction.editReply("❌ Ocorreu um erro ao executar este comando.").catch(() => null);
}
});

process.on("unhandledRejection", (err) => console.error("❌ UnhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("❌ UncaughtException:", err));
client.on("error", (err) => console.error("❌ Erro no client:", err));

client.login(token);
