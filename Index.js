import {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes
} from "discord.js";

import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TOKEN;

if (!token) {
  console.error("❌ TOKEN não encontrada no arquivo .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.commands = new Collection();

import {
  commands,
  executeCommand,
  handleButtons,
  handleModals
} from "./bot.js";

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

client.once("ready", async () => {

  console.log("=================================");
  console.log(`🤖 ${client.user.tag}`);
  console.log("✅ Bot Online");
  console.log("=================================");

  client.user.setPresence({
    activities: [
      {
        name: "VK STORE 🟢"
      }
    ],
    status: "online"
  });

  try {

    const rest = new REST({
      version: "10"
    }).setToken(token);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands.map(c => c.data.toJSON())
      }
    );

    console.log(`✅ ${commands.length} comandos registrados.`);

  } catch (err) {

    console.error(err);

  }

});

client.on("interactionCreate", async interaction => {

  try {

    if (interaction.isButton()) {

      return handleButtons(interaction, client);

    }

    if (interaction.isModalSubmit()) {

      return handleModals(interaction, client);

    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(
      interaction.commandName
    );

    if (!command) return;

    await executeCommand(
      interaction,
      client,
      command
    );

  } catch (err) {

    console.error(err);

    if (interaction.deferred || interaction.replied) {

      interaction.editReply({
        content:
          "❌ Ocorreu um erro ao executar este comando."
      }).catch(() => {});

    } else {

      interaction.reply({
        content:
          "❌ Ocorreu um erro ao executar este comando.",
        ephemeral: true
      }).catch(() => {});

    }

  }

});

process.on("unhandledRejection", err => {

  console.error(err);

});

process.on("uncaughtException", err => {

  console.error(err);

});

client.login(token);
