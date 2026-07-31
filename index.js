const { Client, GatewayIntentBits, ActivityType } = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("DISCORD_BOT_TOKEN não definido!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", (c) => {
  console.log(`Bot online! Logado como: ${c.user.tag}`);

  c.user.setPresence({
    status: "online",
    activities: [
      {
        name: "Online 🟢",
        type: ActivityType.Custom,
      },
    ],
  });
});

client.on("error", (err) => {
  console.error("Erro no bot:", err);
});

client.login(token).catch((err) => {
  console.error("Falha ao conectar:", err);
  process.exit(1);
});
