include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');

var processTemplateId = web.request.queryString.processTemplateId;
processTemplateController.getProcessTemplateVersionHistoryById(processTemplateId);
