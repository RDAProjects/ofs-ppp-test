include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var processId = web.request.queryString.processId; //'fb109829-969a-41ed-95a1-63b30d27c251'; //

var webObj = new SPWeb();
var portalUrl = webObj.portalUrl;
if (portalUrl == '') {
  portalUrl = 'https://ofs.treasuryecm.gov';
}
webObj.url.replace(portalUrl, '') + '/' + processController.getProcessPathByProcessId(processId);
