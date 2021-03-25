include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var body = web.request.getBodyObject();
processController.rejectProcess(body.processId, body.reason); //added to last line in this script
