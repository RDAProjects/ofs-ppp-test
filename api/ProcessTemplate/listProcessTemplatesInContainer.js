include('/ofsppp/api/ppp.common.js');
var processTemplateController = require('ofs-ppp-process-template');
var web = require('Web');

var path = web.request.queryString.path;
processTemplateController.listProcessTemplatesInContainer(path);
