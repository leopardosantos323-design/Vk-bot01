import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} from "discord.js";

import fs from "fs";

const DB = "./db.json";

function loadDB() {
  if (!fs.existsSync(DB)) {
    fs.writeFileSync(
      DB,
      JSON.stringify(
        {
          carteiras: {},
          inventarios: {},
          xp: {},
          reputacoes: {},
          avaliacoes: {},
          stock: [],
          ticketsAbertos: {},
          ticketContador: 0,
          pagamento: null,
          ticketCategoria: null,
          ticketCargos: [],
          ticketLogCanal: null,
          canalStock: null
        },
        null,
        2
      )
    );
  }

  return JSON.parse(fs.readFileSync(DB));
}

function saveDB(db) {
  fs.writeFileSync(DB, JSON.stringify(db, null, 2));
}

const db = loadDB();

function saldo(id) {
  if (!db.carteiras[id]) db.carteiras[id] = 0;
  return db.carteiras[id];
}

function setSaldo(id, valor) {
  db.carteiras[id] = valor;
  saveDB(db);
}

function inventario(id) {
  if (!db.inventarios[id]) db.inventarios[id] = [];
  return db.inventarios[id];
}

function xp(id) {
  if (!db.xp[id]) {
    db.xp[id] = {
      nivel: 1,
      xp: 0
    };
  }

  return db.xp[id];
}

function addXP(id, valor) {

  const x = xp(id);

  x.xp += valor;

  while (x.xp >= x.nivel * 100) {
    x.xp -= x.nivel * 100;
    x.nivel++;
  }

  saveDB(db);

}

function reputacao(id) {

  if (!db.reputacoes[id]) {

    db.reputacoes[id] = {
      total: 0,
      quemDeu: []
    };

  }

  return db.reputacoes[id];

}

export const commands = [

new SlashCommandBuilder()
.setName("ping")
.setDescription("Ver latência"),

new SlashCommandBuilder()
.setName("ajuda")
.setDescription("Lista comandos"),

new SlashCommandBuilder()
.setName("perfil")
.setDescription("Perfil")
.addUserOption(o =>
o
.setName("usuario")
.setDescription("Usuário")
),

new SlashCommandBuilder()
.setName("carteira")
.setDescription("Mostrar saldo"),

new SlashCommandBuilder()
.setName("nivel")
.setDescription("Mostrar nível"),

new SlashCommandBuilder()
.setName("inventario")
.setDescription("Mostrar inventário"),

new SlashCommandBuilder()
.setName("loja")
.setDescription("Mostrar loja"),

new SlashCommandBuilder()
.setName("comprar")
.setDescription("Comprar item")
.addStringOption(o =>
o
.setName("item")
.setDescription("Item")
.setRequired(true)
),
export const commands = [

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Ver latência"),

  new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Lista comandos"),

  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Perfil")
    .addUserOption(o =>
      o.setName("usuario")
       .setDescription("Usuário")
    ),

  new SlashCommandBuilder()
    .setName("carteira")
    .setDescription("Mostrar saldo"),

  new SlashCommandBuilder()
    .setName("nivel")
    .setDescription("Mostrar nível"),

  new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Mostrar inventário"),

  new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Mostrar loja"),

  new SlashCommandBuilder()
    .setName("comprar")
    .setDescription("Comprar item")
    .addStringOption(o =>
      o.setName("item")
       .setDescription("Item")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("dar-coins")
    .setDescription("Dar moedas")
    .addUserOption(o =>
      o.setName("usuario")
       .setDescription("Usuário")
       .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("quantia")
       .setDescription("Quantidade")
       .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("transferir")
    .setDescription("Transferir moedas")
    .addUserOption(o =>
      o.setName("usuario")
       .setDescription("Usuário")
       .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("quantia")
       .setDescription("Quantidade")
       .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("saldo-top")
    .setDescription("Ranking"),

  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("Mostrar stock"),

  new SlashCommandBuilder()
    .setName("addstock")
    .setDescription("Adicionar item ao estoque")
    .addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true))
    .addIntegerOption(o => o.setName("preco").setDescription("Preço").setRequired(true))
    .addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade").setRequired(true))
    .addStringOption(o => o.setName("categoria").setDescription("Categoria"))
    .addStringOption(o => o.setName("descricao").setDescription("Descrição"))
    .addStringOption(o => o.setName("emoji").setDescription("Emoji")),

  new SlashCommandBuilder()
    .setName("editstock")
    .setDescription("Editar item")
    .addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true))
    .addIntegerOption(o => o.setName("preco").setDescription("Preço"))
    .addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade")),

  new SlashCommandBuilder()
    .setName("removestock")
    .setDescription("Remover item")
    .addStringOption(o => o.setName("nome").setDescription("Nome").setRequired(true)),

  new SlashCommandBuilder()
    .setName("setcanal-stock")
    .setDescription("Definir canal do estoque")
    .addChannelOption(o => o.setName("canal").setDescription("Canal").setRequired(true)),

  new SlashCommandBuilder()
    .setName("configurarpagamento")
    .setDescription("Configurar pagamento")
    .addStringOption(o => o.setName("tipo").setDescription("Tipo").setRequired(true))
    .addStringOption(o => o.setName("titular").setDescription("Titular").setRequired(true))
    .addStringOption(o => o.setName("chave").setDescription("Chave").setRequired(true))
    .addStringOption(o => o.setName("info").setDescription("Informações")),

  new SlashCommandBuilder()
    .setName("pagamento")
    .setDescription("Mostrar pagamento"),

  new SlashCommandBuilder()
    .setName("configurarticket")
    .setDescription("Configurar tickets")
    .addChannelOption(o => o.setName("categoria").setDescription("Categoria").setRequired(true))
    .addRoleOption(o => o.setName("cargo-suporte").setDescription("Cargo").setRequired(true))
    .addChannelOption(o => o.setName("log").setDescription("Canal de log")),

  new SlashCommandBuilder()
    .setName("painel-ticket")
    .setDescription("Enviar painel"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Abrir ticket"),

  new SlashCommandBuilder()
    .setName("fecharticket")
    .setDescription("Fechar ticket"),

  new SlashCommandBuilder()
    .setName("assumirticket")
    .setDescription("Assumir ticket"),

  new SlashCommandBuilder()
    .setName("adicionarticket")
    .setDescription("Adicionar usuário")
    .addUserOption(o =>
      o.setName("usuario")
       .setDescription("Usuário")
       .setRequired(true)
    )

];
new SlashCommandBuilder()
.setName("dar-coins")
.setDescription("Dar moedas")

const name = interaction.commandName;

if (name === "ping") {

return interaction.reply({
content:
`🏓 Pong!\nAPI: ${Math.round(client.ws.ping)}ms`
});

}

if (name === "ajuda") {

const embed = new EmbedBuilder()

.setTitle("📖 Comandos")

.setColor(0x5865F2)

.addFields(

{
name:"💰 Economia",
value:"/carteira\n/loja\n/comprar\n/inventario\n/transferir\n/saldo-top"
},

{
name:"👤 Perfil",
value:"/perfil\n/nivel"
},

{
name:"📦 Stock",
value:"/stock"
},

{
name:"🎫 Tickets",
value:"/ticket"
}

)

.setFooter({
text:"VK BOT"
});

return interaction.reply({
embeds:[embed]
});

}

if(name==="carteira"){

return interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("💰 Carteira")

.setDescription(
`Você possui **${saldo(interaction.user.id)} moedas**`
)

.setColor(0xFFD700)

]

});

}

if(name==="nivel"){

const dados=xp(interaction.user.id);

return interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("📈 Nível")

.addFields(

{
name:"Nível",
value:String(dados.nivel),
inline:true
},

{
name:"XP",
value:String(dados.xp),
inline:true
}

)

.setColor(0x5865F2)

]

});

}

if(name==="perfil"){

const alvo=
interaction.options.getUser("usuario")
??interaction.user;

const rep=reputacao(alvo.id);

const dados=xp(alvo.id);

return interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle(`👤 ${alvo.username}`)

.setThumbnail(
alvo.displayAvatarURL()
)

.addFields(

{
name:"💰 Saldo",
value:String(saldo(alvo.id)),
inline:true
},

{
name:"📈 Nível",
value:String(dados.nivel),
inline:true
},

{
name:"⭐ Reputação",
value:String(rep.total),
inline:true
}

)

.setColor(0x5865F2)

]

});

}

if(name==="inventario"){

const inv=inventario(
interaction.user.id
);

return interaction.reply({

content:

inv.length

?inv.join("\n")

:"Inventário vazio."

});

}

if(name==="loja"){

const embed=new EmbedBuilder()

.setTitle("🏪 Loja")

.setDescription(

"🧪 Poção - 100\n🗡️ Espada - 500\n💎 VIP - 1000"

)

.setColor(0x00FF88);

return interaction.reply({

embeds:[embed]

});

  }if(name==="comprar"){

const item=
interaction.options.getString("item");

const precos={

"poção":100,
"espada":500,
"vip":1000

};

if(!precos[item.toLowerCase()]){

return interaction.reply({

content:"❌ Item inexistente."

});

}

const preco=precos[item.toLowerCase()];

if(saldo(interaction.user.id)<preco){

return interaction.reply({

content:"❌ Você não possui moedas suficientes."

});

}

setSaldo(

interaction.user.id,

saldo(interaction.user.id)-preco

);

inventario(interaction.user.id)

.push(item);

saveDB(db);

addXP(interaction.user.id,20);

return interaction.reply({

content:`✅ Você comprou **${item}** por **${preco} moedas**.`

});

}

if(name==="dar-coins"){

const alvo=

interaction.options.getUser("usuario");

const quantia=

interaction.options.getInteger("quantia");

setSaldo(

alvo.id,

saldo(alvo.id)+quantia

);

return interaction.reply({

content:`💰 ${quantia} moedas enviadas para ${alvo}.`

});

}

if(name==="transferir"){

const alvo=

interaction.options.getUser("usuario");

const quantia=

interaction.options.getInteger("quantia");

if(alvo.id===interaction.user.id){

return interaction.reply({

content:"❌ Você não pode transferir para si mesmo."

});

}

if(saldo(interaction.user.id)<quantia){

return interaction.reply({

content:"❌ Saldo insuficiente."

});

}

setSaldo(

interaction.user.id,

saldo(interaction.user.id)-quantia

);

setSaldo(

alvo.id,

saldo(alvo.id)+quantia

);

return interaction.reply({

content:`✅ Transferência de ${quantia} moedas realizada para ${alvo}.`

});

}

if(name==="saldo-top"){

const ranking=

Object.entries(db.carteiras)

.sort((a,b)=>b[1]-a[1])

.slice(0,10);

const texto=

ranking.map((u,i)=>

`${i+1}. <@${u[0]}> - ${u[1]} moedas`

).join("\n");

return interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("🏆 Ranking")

.setDescription(

texto||"Sem usuários."

)

.setColor(0xFFD700)

]

});

}

if(name==="stock"){

if(!db.stock.length){

return interaction.reply({

content:"📦 Nenhum item em estoque."

});

}

const embed=

new EmbedBuilder()

.setTitle("📦 Stock")

.setColor(0x00FF88);

for(const item of db.stock){

embed.addFields({

name:item.nome,

value:

`💰 ${item.preco}\n📦 ${item.quantidade}`

});

}

return interaction.reply({

embeds:[embed]

});

}if(name==="addstock"){

const nome=
interaction.options.getString("nome");

const preco=
interaction.options.getInteger("preco");

const quantidade=
interaction.options.getInteger("quantidade");

const categoria=
interaction.options.getString("categoria")??"Geral";

const descricao=
interaction.options.getString("descricao")??"Sem descrição";

const emoji=
interaction.options.getString("emoji")??"📦";

db.stock.push({

id:Date.now().toString(),

nome,

preco,

quantidade,

categoria,

descricao,

emoji

});

saveDB(db);

return interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("✅ Item adicionado!")

.setColor(0x00ff88)

.addFields(

{

name:"📦 Item",

value:`${emoji} ${nome}`,

inline:true

},

{

name:"💰 Preço",

value:`${preco}`,

inline:true

},

{

name:"📦 Quantidade",

value:`${quantidade}`,

inline:true

}

)

]

});

}

if(name==="editstock"){

const nome=

interaction.options.getString("nome");

const item=

db.stock.find(

x=>x.nome.toLowerCase()===nome.toLowerCase()

);

if(!item){

return interaction.reply({

content:"❌ Item não encontrado."

});

}

const preco=

interaction.options.getInteger("preco");

const quantidade=

interaction.options.getInteger("quantidade");

if(preco!==null)item.preco=preco;

if(quantidade!==null)item.quantidade=quantidade;

saveDB(db);

return interaction.reply({

content:"✅ Stock atualizado."

});

}

if(name==="removestock"){

const nome=

interaction.options.getString("nome");

const index=

db.stock.findIndex(

x=>x.nome.toLowerCase()===nome.toLowerCase()

);

if(index===-1){

return interaction.reply({

content:"❌ Item não encontrado."

});

}

db.stock.splice(index,1);

saveDB(db);

return interaction.reply({

content:"🗑️ Item removido."

});

}

if(name==="setcanal-stock"){

const canal=

interaction.options.getChannel("canal");

db.canalStock=canal.id;

saveDB(db);

return interaction.reply({

content:`✅ Canal ${canal} definido.`

});

}

if(name==="configurarpagamento"){

db.pagamento={

tipo:interaction.options.getString("tipo"),

titular:interaction.options.getString("titular"),

chave:interaction.options.getString("chave"),

info:interaction.options.getString("info")??""

};

saveDB(db);

return interaction.reply({

content:"✅ Pagamento configurado."

});

}

if(name==="pagamento"){

if(!db.pagamento){

return interaction.reply({

content:"❌ Nenhum pagamento configurado."

});

}

return interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("💳 Pagamento")

.addFields(

{

name:"Tipo",

value:db.pagamento.tipo

},

{

name:"Titular",

value:db.pagamento.titular

},

{

name:"Chave",

value:db.pagamento.chave

},

{

name:"Info",

value:db.pagamento.info||"Nenhuma"

}

)

.setColor(0x5865F2)

]

});

  }if(name==="configurarticket"){

const categoria=
interaction.options.getChannel("categoria");

const cargo=
interaction.options.getRole("cargo-suporte");

const log=
interaction.options.getChannel("log");

db.ticketCategoria=categoria.id;
db.ticketCargos=[cargo.id];
db.ticketLogCanal=log?.id??null;

saveDB(db);

return interaction.reply({

content:"✅ Sistema de tickets configurado."

});

}

if(name==="painel-ticket"){

const embed=new EmbedBuilder()

.setTitle("🎫 Suporte")

.setDescription(
"Clique no botão abaixo para abrir um ticket."
)

.setColor(0x5865F2);

const row=new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId("abrir_ticket")

.setLabel("Abrir Ticket")

.setEmoji("🎫")

.setStyle(ButtonStyle.Primary)

);

return interaction.reply({

embeds:[embed],

components:[row]

});

}

if(name==="ticket"){

const modal=new ModalBuilder()

.setCustomId("modal_ticket")

.setTitle("Abrir Ticket");

const assunto=new TextInputBuilder()

.setCustomId("assunto")

.setLabel("Assunto")

.setStyle(TextInputStyle.Short)

.setRequired(true);

modal.addComponents(

new ActionRowBuilder()

.addComponents(assunto)

);

return interaction.showModal(modal);

}

if(name==="fecharticket"){

await interaction.channel.delete();

return;

}

if(name==="assumirticket"){

return interaction.reply({

content:`✋ ${interaction.user} assumiu este ticket.`

});

}

if(name==="adicionarticket"){

const usuario=

interaction.options.getUser("usuario");

await interaction.channel.permissionOverwrites.edit(

usuario.id,

{

ViewChannel:true,

SendMessages:true

}

);

return interaction.reply({

content:`✅ ${usuario} adicionado ao ticket.`

});

}

}

export async function handleButtons(interaction){

if(interaction.customId!=="abrir_ticket")return;

const modal=new ModalBuilder()

.setCustomId("modal_ticket")

.setTitle("Abrir Ticket");

const assunto=new TextInputBuilder()

.setCustomId("assunto")

.setLabel("Assunto")

.setStyle(TextInputStyle.Short)

.setRequired(true);

modal.addComponents(

new ActionRowBuilder()

.addComponents(assunto)

);

await interaction.showModal(modal);

}

export async function handleModals(interaction){

if(interaction.customId!=="modal_ticket")return;

const assunto=

interaction.fields.getTextInputValue("assunto");

const canal=

await interaction.guild.channels.create({

name:`ticket-${interaction.user.username}`,

type:ChannelType.GuildText,

parent:db.ticketCategoria??null,

permissionOverwrites:[

{

id:interaction.guild.id,

deny:["ViewChannel"]

},

{

id:interaction.user.id,

allow:["ViewChannel","SendMessages"]

}

]

});

db.ticketsAbertos[canal.id]={

usuario:interaction.user.id,

assunto

};

saveDB(db);

await canal.send({

content:`🎫 ${interaction.user} seu ticket foi criado.\n**Assunto:** ${assunto}`

});

return interaction.reply({

content:`✅ Ticket criado: ${canal}`,

ephemeral:true

});

  }
