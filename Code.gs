/**
 * Track Bravos do Norte — Apps Script mínimo, usado SÓ para guardar fotos
 * de atividades/ensinamentos no Google Drive. NÃO é o banco de dados deste
 * sistema (isso é o Firestore) — não adicione nenhuma lógica de negócio
 * aqui.
 *
 * COMO USAR:
 * 1. Crie uma planilha Google Sheets em branco, só para servir de "casa"
 *    pro script (o conteúdo dela não importa).
 * 2. Menu Extensões > Apps Script.
 * 3. Apague o conteúdo padrão e cole TODO este arquivo.
 * 4. Rode a função "getUploadsFolder" uma vez direto no editor (▶) para
 *    autorizar o acesso ao Google Drive antes de implantar.
 * 5. Menu Implantar > Nova implantação > tipo "Aplicativo da Web".
 *    - Executar como: Eu (seu e-mail)
 *    - Quem pode acessar: Qualquer pessoa
 *    Copie a URL "/exec" gerada.
 * 6. Cole essa URL na constante PHOTO_UPLOAD_URL do app.js.
 */

var UPLOADS_FOLDER_NAME = "Track Bravos do Norte - Fotos";

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return json_(rotear_(body));
}

function rotear_(body) {
  try {
    switch (body.action) {
      case "uploadPhoto": return uploadPhoto_(body.base64, body.nomeArquivo);
      default: return { ok: false, erro: "Ação desconhecida: " + body.action };
    }
  } catch (err) {
    return { ok: false, erro: String(err) };
  }
}

function uploadPhoto_(base64, nomeArquivo) {
  var partes = String(base64).split(",");
  var conteudo = partes.length > 1 ? partes[1] : partes[0];
  var mimeMatch = /data:([^;]+);/.exec(base64);
  var mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

  var bytes = Utilities.base64Decode(conteudo);
  var blob = Utilities.newBlob(bytes, mime, nomeArquivo || ("foto_" + Date.now() + ".jpg"));

  var pasta = getUploadsFolder();
  var arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: arquivo.getId(),
    url: "https://drive.google.com/thumbnail?id=" + arquivo.getId() + "&sz=w500"
  };
}

// Cacheia o ID da pasta pra não precisar de getFoldersByName em toda
// chamada (evita um bug conhecido de escopo de permissão do Apps Script
// quando essa busca roda repetidamente sob o gatilho de doPost).
function getUploadsFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("UPLOADS_FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  var pastas = DriveApp.getFoldersByName(UPLOADS_FOLDER_NAME);
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(UPLOADS_FOLDER_NAME);
  props.setProperty("UPLOADS_FOLDER_ID", pasta.getId());
  return pasta;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
