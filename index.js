const { Client, GatewayIntentBits, ActivityType, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;
const PIX_KEY = process.env.PIX_KEY || "Leopardosantos323@gmail.com";

if (!token) { console.error("DISCORD_BOT_TOKEN não definido!"); process.exit(1); }

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Verifica se o bot está respondendo"),
  new SlashCommandBuilder().setName("ajuda").setDescription("Mostra todos os comandos disponíveis"),
  new SlashCommandBuilder().setName("info").setDescription("Informações sobre o bot"),
  new SlashCommandBuilder().setName("oi").setDescription("O bot te manda um salve!"),
  new SlashCommandBuilder().setName("dado").setDescription("Joga um dado de 6 faces"),
  new SlashCommandBuilder().setName("cara-ou-coroa").setDescription("Joga uma moeda"),
  new SlashCommandBuilder().setName("pix").setDescription("Mostra a chave Pix para pagamento"),
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async (c) => {
  console.log(`Bot online! Logado como: ${c.user.tag}`);
  c.user.setPresence({ status: "online", activities: [{ name: "Online 🟢", type: ActivityType.Custom }] });
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands.map(cmd => cmd.toJSON()) });
    console.log("Comandos registrados!");
  } catch (err) { console.error("Erro ao registrar comandos:", err); }
});

client.on("channelCreate", async (channel) => {
  const name = channel.name?.toLowerCase() || "";
  const isTicket = name.includes("ticket") || name.includes("pagamento") || name.includes("pedido") || name.includes("compra") || name.includes("suporte");
  if (!isTicket) return;
  try {
    await new Promise(r => setTimeout(r, 2000));
    const embed = new EmbedBuilder()
      .setTitle("💳 Dados para Pagamento")
      .setColor(0x00d166)
      .setDescription("Olá! Segue abaixo a chave Pix para realizar o pagamento:")
      .addFields(
        { name: "🔑 Chave Pix", value: `\`${PIX_KEY}\`` },
        { name: "⚠️ Atenção", value: "Após realizar o pagamento, envie o comprovante aqui neste ticket." }
      )
      .setFooter({ text: "Após confirmação do pagamento, seu pedido será processado." })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    console.log(`Pix enviado no canal: ${channel.name}`);
  } catch (err) { console.error(`Erro ao enviar Pix:`, err); }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  if (commandName === "ping") await interaction.reply(`🏓 Pong! Latência: **${Date.now() - interaction.createdTimestamp}ms**`);
  if (commandName === "pix") {
    const embed = new EmbedBuilder().setTitle("💳 Dados para Pagamento").setColor(0x00d166)
      .addFields({ name: "🔑 Chave Pix", value: `\`${PIX_KEY}\`` }, { name: "⚠️ Atenção", value: "Após pagar, envie o comprovante aqui." })
      .setFooter({ text: "Obrigado pela preferência! 🙏" });
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === "ajuda") {
    const embed = new EmbedBuilder().setTitle("📋 Comandos disponíveis").setColor(0x5865f2)
      .addFields(
        { name: "/ping", value: "Verifica se o bot está respondendo" },
        { name: "/pix", value: "Mostra a chave Pix para pagamento" },
        { name: "/ajuda", value: "Mostra esta mensagem" },
        { name: "/info", value: "Informações sobre o bot" },
        { name: "/oi", value: "O bot te manda um salve!" },
        { name: "/dado", value: "Joga um dado de 6 faces" },
        { name: "/cara-ou-coroa", value: "Joga uma moeda" }
      ).setFooter({ text: "Bot sempre online 24/7 🟢" });
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === "info") {
    const embed = new EmbedBuilder().setTitle("🤖 Informações do Bot").setColor(0x57f287)
      .addFields({ name: "Nome", value: client.user.tag, inline: true }, { name: "Status", value: "🟢 Online 24/7", inline: true }, { name: "Servidores", value: `${client.guilds.cache.size}`, inline: true }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === "oi") {
    const r = [`Salve, ${interaction.user.displayName}! 👋`, `Eae ${interaction.user.displayName}! 😎`, `Oi ${interaction.user.displayName}! 🙌`, `Fala ${interaction.user.displayName}! 🤙`];
    await interaction.reply(r[Math.floor(Math.random() * r.length)]);
  }
  if (commandName === "dado") await interaction.reply(`🎲 Você tirou: **${Math.floor(Math.random() * 6) + 1}**`);
  if (commandName === "cara-ou-coroa") await interaction.reply(Math.random() < 0.5 ? "🪙 Cara!" : "🪙 Coroa!");
});

client.on("error", (err) => console.error("Erro no bot:", err));
client.login(token).catch((err) => { console.error("Falha ao conectar:", err); process.exit(1); });
        
