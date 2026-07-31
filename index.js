const {
  Clientready,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("DISCORD_BOT_TOKEN não definido!");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Verifica se o bot está respondendo"),
  new SlashCommandBuilder().setName("ajuda").setDescription("Mostra todos os comandos disponíveis"),
  new SlashCommandBuilder().setName("info").setDescription("Informações sobre o bot"),
  new SlashCommandBuilder().setName("oi").setDescription("O bot te manda um salve!"),
  new SlashCommandBuilder().setName("dado").setDescription("Joga um dado de 6 faces"),
  new SlashCommandBuilder().setName("cara-ou-coroa").setDescription("Joga uma moeda"),
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async (c) => {
  console.log(`Bot online! Logado como: ${c.user.tag}`);
  c.user.setPresence({ status: "online", activities: [{ name: "Online 🟢", type: ActivityType.Custom }] });
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands.map((cmd) => cmd.toJSON()) });
    console.log("Comandos registrados!");
  } catch (err) {
    console.error("Erro ao registrar comandos:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "ping") {
    await interaction.reply(`🏓 Pong! Latência: **${Date.now() - interaction.createdTimestamp}ms**`);
  }
  if (commandName === "ajuda") {
    const embed = new EmbedBuilder().setTitle("📋 Comandos disponíveis").setColor(0x5865f2)
      .addFields(
        { name: "/ping", value: "Verifica se o bot está respondendo" },
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
      .addFields(
        { name: "Nome", value: client.user.tag, inline: true },
        { name: "Status", value: "🟢 Online 24/7", inline: true },
        { name: "Servidores", value: `${client.guilds.cache.size}`, inline: true }
      ).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === "oi") {
    const respostas = [`Salve, ${interaction.user.displayName}! 👋`, `Eae ${interaction.user.displayName}! 😎`, `Oi ${interaction.user.displayName}! 🙌`, `Fala ${interaction.user.displayName}! 🤙`];
    await interaction.reply(respostas[Math.floor(Math.random() * respostas.length)]);
  }
  if (commandName === "dado") {
    await interaction.reply(`🎲 Você tirou: **${Math.floor(Math.random() * 6) + 1}**`);
  }
  if (commandName === "cara-ou-coroa") {
    await interaction.reply(Math.random() < 0.5 ? "🪙 Cara!" : "🪙 Coroa!");
  }
});

client.on("error", (err) => console.error("Erro no bot:", err));
client.login(token).catch((err) => { console.error("Falha ao conectar:", err); process.exit(1); });
