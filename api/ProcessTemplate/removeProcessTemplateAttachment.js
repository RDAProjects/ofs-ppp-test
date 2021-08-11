include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');

var body = web.request.getBodyObject();
if (body.activityId && body.activityId.length > 0) {
  processTemplateController.removeProcessTemplateAttachment(body.processId, body.fileName, body.activityId);
} else {
  processTemplateController.removeProcessTemplateAttachment(body.processId, body.fileName);
}
