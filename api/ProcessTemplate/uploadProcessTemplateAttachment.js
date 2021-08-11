include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');
var fileName = web.request.queryString.fileName;

//Get the first file uploaded
var file = web.request.files[Object.keys(web.request.files)[0]];
var processId = web.request.queryString.processId;

if (web.request.queryString.activityId) {
  var activityId = web.request.queryString.activityId;
  processTemplateController.uploadProcessTemplateAttachment(processId, fileName, file, activityId);
} else {
  processTemplateController.uploadProcessTemplateAttachment(processId, fileName, file);
}
