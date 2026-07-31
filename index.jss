import { Client, GatewayIntentBits, ActivityType } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("DISCORD_BOT_TOKEN não definido!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", (c) => {
  console.log(`✅ Bot conectado como ${c.user.tag}`);
  c.user.setPresence({
    status: "online",
    activities: [{ name: "online 24/7", type: ActivityType.Custom }],
  });
});

client.on("error", (err) => {
  console.error("Erro no cliente Discord:", err);
});

client.login(token).catch((err) => {
  console.error("Falha ao fazer login:", err);
  process.exit(1);
});{
  "name": "discord-bot",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.27.0"
  }
}FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.js ./
CMD ["node", "index.js"]
