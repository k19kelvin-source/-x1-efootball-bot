require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client, GatewayIntentBits, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  REST, Routes, SlashCommandBuilder
} = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CONFIG_FILE = path.join(__dirname, "config.json");
const DEFAULT_TAXA = 20;
const x1s = new Map();
let nextId = 1;

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
function getTaxa(guildId) {
  const config = loadConfig();
  return Number.isFinite(config[guildId]?.taxa) ? config[guildId].taxa : DEFAULT_TAXA;
}
function setTaxa(guildId, taxa) {
  const config = loadConfig();
  config[guildId] = { ...(config[guildId] || {}), taxa };
  saveConfig(config);
}
const money = v => `R$ ${v.toFixed(2).replace(".", ",")}`;

const commands = [
  new SlashCommandBuilder().setName("teste").setDescription("Testa se o bot está funcionando"),
  new SlashCommandBuilder().setName("x1").setDescription("Sistema de X1 eFootball")
    .addSubcommand(s => s.setName("criar").setDescription("Cria um X1 e coloca na fila")
      .addIntegerOption(o => o.setName("valor").setDescription("Valor por jogador em reais")
        .setRequired(true).setMinValue(1).setMaxValue(10000))),
  new SlashCommandBuilder().setName("config").setDescription("Configura o sistema do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(s => s.setName("taxa").setDescription("Define a taxa do X1 em porcentagem")
      .addIntegerOption(o => o.setName("porcentagem").setDescription("Taxa entre 0 e 100")
        .setRequired(true).setMinValue(0).setMaxValue(100)))
].map(c => c.toJSON());

function embedX1(x1, status="AGUARDANDO OPONENTE") {
  const taxa = getTaxa(x1.guildId);
  const total = x1.valor * 2;
  const premio = total - total * taxa / 100;
  return new EmbedBuilder().setTitle(`⚔️ X1 EFOOTBALL #${x1.id}`)
    .setDescription(`**Status:** ${status}`)
    .addFields(
      {name:"💰 Entrada",value:money(x1.valor),inline:true},
      {name:"👥 Jogadores",value:x1.jogador2?"2/2":"1/2",inline:true},
      {name:"📊 Taxa",value:`${taxa}%`,inline:true},
      {name:"🏆 Prêmio",value:money(premio),inline:true},
      {name:"👤 Jogador 1",value:`<@${x1.jogador1}>`,inline:true},
      {name:"👤 Jogador 2",value:x1.jogador2?`<@${x1.jogador2}>`:"Aguardando...",inline:true}
    ).setFooter({text:"Pagamento/PIX ainda não é processado pelo bot."});
}
const row = (id,disabled=false)=>new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`x1_entrar_${id}`).setLabel("ENTRAR NO X1")
    .setEmoji("⚔️").setStyle(ButtonStyle.Success).setDisabled(disabled)
);

client.once("ready", async ()=>{
  console.log(`Bot conectado como ${client.user.tag}`);
  try {
    const rest=new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id),{body:commands});
    console.log("Comandos registrados.");
  } catch(e){console.error("Erro ao registrar comandos:",e);}
});

client.on("interactionCreate", async interaction=>{
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName==="teste")
        return interaction.reply("⚽ Bot X1 eFootball funcionando!");

      if (interaction.commandName==="config" && interaction.options.getSubcommand()==="taxa") {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
          return interaction.reply({content:"❌ Você não tem permissão para alterar a taxa.",ephemeral:true});
        const taxa=interaction.options.getInteger("porcentagem");
        setTaxa(interaction.guildId,taxa);
        return interaction.reply(`✅ Taxa do servidor definida para **${taxa}%**. Novos X1 usarão essa taxa.`);
      }

      if (interaction.commandName==="x1" && interaction.options.getSubcommand()==="criar") {
        const valor=interaction.options.getInteger("valor");
        for (const x1 of x1s.values())
          if(x1.guildId===interaction.guildId&&x1.status==="aguardando"&&x1.jogador1===interaction.user.id)
            return interaction.reply({content:`❌ Você já tem o X1 #${x1.id} aguardando um oponente.`,ephemeral:true});

        const x1={id:nextId++,guildId:interaction.guildId,valor,jogador1:interaction.user.id,
          jogador2:null,status:"aguardando",canalFilaId:interaction.channelId,salaId:null};
        x1s.set(x1.id,x1);
        await interaction.reply({embeds:[embedX1(x1)],components:[row(x1.id)]});
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("x1_entrar_")) {
      const id=Number(interaction.customId.split("_")[2]), x1=x1s.get(id);
      if(!x1) return interaction.reply({content:"❌ Esse X1 não existe mais.",ephemeral:true});
      if(x1.status!=="aguardando") return interaction.reply({content:"❌ Esse X1 já está completo.",ephemeral:true});
      if(interaction.user.id===x1.jogador1) return interaction.reply({content:"❌ Você não pode entrar no próprio X1.",ephemeral:true});

      x1.jogador2=interaction.user.id; x1.status="em_andamento";
      const guild=interaction.guild;
      const overwrites=[
        {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
        ...[x1.jogador1,x1.jogador2].map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]})),
        {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]}
      ];
      const sala=await guild.channels.create({
        name:`x1-${String(x1.id).padStart(4,"0")}`,type:ChannelType.GuildText,
        parent:interaction.channel.parentId||null,permissionOverwrites:overwrites,
        topic:`X1 #${x1.id} | ${money(x1.valor)} por jogador`
      });
      x1.salaId=sala.id;
      const taxa=getTaxa(x1.guildId),total=x1.valor*2,premio=total-total*taxa/100;
      const e=new EmbedBuilder().setTitle(`⚔️ SALA DO X1 #${x1.id}`)
        .setDescription("A partida foi formada. Esta sala é privada para os dois jogadores.")
        .addFields(
          {name:"👤 Jogador 1",value:`<@${x1.jogador1}>`,inline:true},
          {name:"👤 Jogador 2",value:`<@${x1.jogador2}>`,inline:true},
          {name:"💰 Entrada",value:money(x1.valor),inline:true},
          {name:"📊 Taxa",value:`${taxa}%`,inline:true},
          {name:"🏆 Prêmio",value:money(premio),inline:true},
          {name:"💵 Total",value:money(total),inline:true}
        ).setFooter({text:"PIX, comprovantes e resultado serão adicionados no próximo módulo."});
      await sala.send({content:`<@${x1.jogador1}> <@${x1.jogador2}>`,embeds:[e]});
      await interaction.update({embeds:[embedX1(x1,"X1 FORMADO")],components:[row(id,true)]});
      await interaction.followUp({content:`✅ X1 #${id} formado! Sala privada: <#${sala.id}>`,ephemeral:true});
    }
  } catch(e){
    console.error("Erro na interação:",e);
    if(interaction.isRepliable()&&!interaction.replied&&!interaction.deferred)
      await interaction.reply({content:"❌ Ocorreu um erro ao processar essa ação.",ephemeral:true}).catch(()=>{});
  }
});
client.login(process.env.DISCORD_TOKEN);
