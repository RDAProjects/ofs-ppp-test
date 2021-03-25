include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var processId = web.request.queryString.processId;
processController.getProcessById(processId);
