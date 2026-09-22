const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("teste")
    .setDescription("Testa se o bot está funcionando"),

  new SlashCommandBuilder()
    .setName("x1")
    .setDescription("Inicia um X1 de eFootball")
    .addIntegerOption(option =>
      option
        .setName("valor")
        .setDescription("Valor do X1 em reais")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registrando comandos...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("Comandos registrados com sucesso!");
  } catch (error) {
    console.error(error);
  }
})();
