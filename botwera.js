require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ROLE_ID = process.env.ROLE_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

const DATA_FILE = path.join(__dirname, 'data.json');

let data = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    const file = JSON.parse(fs.readFileSync(DATA_FILE));
    if (typeof file === 'object' && !Array.isArray(file)) {
      data = file;
    } else {
      data = {};
    }
  } catch {
    data = {};
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function initUsers(guild) {
  const role = await guild.roles.fetch(ROLE_ID);
  const members = role.members;

  members.forEach(member => {
    if (!data[member.id]) {
      data[member.id] = { count: 0, entries: [] };
    }
  });

  save();
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers // 🔥 KLUCZOWE
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName('lista')
    .setDescription('Aktywność')
    .addSubcommand(s => s.setName('aktywnosc-et').setDescription('Ranking'))
    .addSubcommand(s => s.setName('aktywnosc-resetuj').setDescription('Reset'))
    .addSubcommand(s => s.setName('aktywnosc-raport').setDescription('CSV raport'))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.on('ready', async () => {
  console.log(`Zalogowany jako ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);

  await guild.members.fetch();

  await initUsers(guild);

  const channel = await client.channels.fetch(CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setTitle("📋 Formularz Event Team")
    .setDescription("Wypełnij formularz dotyczący aktywności Event Team według przedstawionego wzoru");

  const button = new ButtonBuilder()
    .setCustomId('open_form')
    .setLabel('Formularz ET')
    .setStyle(ButtonStyle.Secondary);

  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(button)]
  });
});

client.on('interactionCreate', async interaction => {

  // form
  if (interaction.isButton() && interaction.customId === 'open_form') {

    const modal = new ModalBuilder()
      .setCustomId('form_et')
      .setTitle('Formularz ET');

    modal.addComponents(

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date')
          .setLabel('Data')
          .setPlaceholder('Wpisz datę realizowanego epizodu')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nick')
          .setLabel('Nick IC')
          .setPlaceholder('Wprowadź epizodyczny nick IC')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('desc')
          .setLabel('Opis')
          .setPlaceholder('Opisz krótko rozgrywany epizod')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('type')
          .setLabel('Rodzaj epizodu')
          .setPlaceholder('Epizod na prośbę gracza czy własna inicjatywa?')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('proof')
          .setLabel('Screenshot')
          .setPlaceholder('Wprowadź link do screenshota')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit()) {

    const values = {
      date: interaction.fields.getTextInputValue('date'),
      nick: interaction.fields.getTextInputValue('nick'),
      desc: interaction.fields.getTextInputValue('desc'),
      type: interaction.fields.getTextInputValue('type'),
      proof: interaction.fields.getTextInputValue('proof')
    };

    interaction.client.tempData ??= {};
    interaction.client.tempData[interaction.user.id] = values;

    await interaction.reply({
      content: "Czy dane są poprawne?",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm').setLabel('Tak').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('edit').setLabel('Popraw').setStyle(ButtonStyle.Danger)
        )
      ],
      ephemeral: true
    });
  }

  if (interaction.isButton() && interaction.customId === 'confirm') {

    const userId = interaction.user.id;

    const role = await interaction.guild.roles.fetch(ROLE_ID);
    if (!role.members.has(userId)) {
      return interaction.update({
        content: "Nie masz wymaganej roli.",
        components: []
      });
    }

    const values = interaction.client.tempData[userId];

    const embed = new EmbedBuilder()
      .setTitle("📊 Nowy epizod")
      .addFields(
        { name: "👤 Użytkownik", value: `<@${userId}>` },
        { name: "📅 Data", value: values.date },
        { name: "🎭 Nick IC", value: values.nick },
        { name: "📝 Opis", value: values.desc },
        { name: "📌 Rodzaj", value: values.type },
        { name: "📷 Screenshot", value: values.proof }
      );

    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send({ embeds: [embed] });

    if (!data[userId]) {
      data[userId] = { count: 0, entries: [] };
    }

    data[userId].count++;

    data[userId].entries.push({
      date: values.date,
      nick: values.nick,
      desc: values.desc,
      type: values.type,
      proof: values.proof
    });

    save();

    delete interaction.client.tempData[userId];

    await interaction.update({
      content: "✅ Zapisano!",
      components: []
    });
  }

  if (interaction.isChatInputCommand()) {

    const sub = interaction.options.getSubcommand();

    if (sub === 'aktywnosc-et') {

      const role = await interaction.guild.roles.fetch(ROLE_ID);
      const users = role.members;

      users.forEach(member => {
        if (!data[member.id]) {
          data[member.id] = { count: 0, entries: [] };
        }
      });

      for (const id of Object.keys(data)) {
        if (!users.has(id)) {
          delete data[id];
        }
      }

      save();

      const sorted = Object.entries(data)
        .sort((a, b) => b[1].count - a[1].count);

      const medals = ["🥇", "🥈", "🥉"];

      let text = "";

      sorted.forEach(([id, user], i) => {
        const medal = medals[i] ? medals[i] + " " : "";
        text += `${medal}${i + 1}. <@${id}> — ${user.count} epizodów\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🏆 Ranking Event Team")
        .setDescription(text || "Brak danych")
        .setColor(0xFFD700);

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    if (sub === 'aktywnosc-resetuj') {

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({
          content: "Brak uprawnień.",
          ephemeral: true
        });
      }

      data = {};
      save();

      await interaction.reply({
        content: "Ranking zresetowany.",
        ephemeral: true
      });
    }

    // CSV RAPORT
    if (sub === 'aktywnosc-raport') {

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({
          content: "Brak uprawnień.",
          ephemeral: true
        });
      }

      let csv = "UserID,Username,Data,Nick IC,Opis,Rodzaj,Screenshot\n";

      for (const [userId, userData] of Object.entries(data)) {

        const user = await interaction.client.users.fetch(userId).catch(() => null);
        const username = user ? user.tag : "Unknown";

        userData.entries.forEach(entry => {
          csv += `"${userId}","${username}","${entry.date}","${entry.nick}","${entry.desc}","${entry.type}","${entry.proof}"\n`;
        });
      }

      const file = new AttachmentBuilder(Buffer.from(csv), { name: 'raport.csv' });

      await interaction.reply({
        content: "Pełny raport aktywności Event Team:",
        files: [file],
        ephemeral: true
      });
    }
  }
});

client.login(TOKEN);