import {
  Client,
  GatewayIntentBits,
  Events
} from "discord.js";

import {
  commands,
  executeCommand,
  handleButtons,
  handleModals
} from "./index.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online: ${c.user.tag}`);

  try {
    await client.application.commands.set(commands);
    console.log("✅ Slash Commands registrados.");
  } catch (err) {
    console.error(err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await executeCommand(interaction, client);
    }

    if (interaction.isButton()) {
      await handleButtons(interaction);
    }

    if (interaction.isModalSubmit()) {
      await handleModals(interaction);
    }
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.TOKEN);
