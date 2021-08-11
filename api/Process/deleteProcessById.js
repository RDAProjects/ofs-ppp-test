include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');

var body = web.request.getBodyObject();
var deleteStatus = false;

var process = processController.getProcessById(body.processId);

if (process.status != 'CompletedAndSigned' && !process.unSigned) {
  processController.deleteProcessById(body.processId);
  deleteStatus = true;
}
deleteStatus;
