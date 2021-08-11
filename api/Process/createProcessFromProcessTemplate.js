include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var body = web.request.getBodyObject();
processController.createProcessFromProcessTemplate(body.processTemplateId, body.version, body.name, body.transactionDate, body.fiscalYear, body.relatedRejectedProcessInstance);
