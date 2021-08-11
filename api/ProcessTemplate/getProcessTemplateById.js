include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');

var processTemplateId = web.request.queryString.processTemplateId;
var version = web.request.queryString.version;
processTemplateController.getProcessTemplateById(processTemplateId, version);
