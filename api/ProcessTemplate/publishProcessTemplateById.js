include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');

var body = web.request.getBodyObject();
processTemplateController.publishProcessTemplateById(body.processTemplateId, body.versionComment);
