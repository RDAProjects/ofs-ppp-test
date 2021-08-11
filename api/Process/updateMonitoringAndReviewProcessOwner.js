include('/ofsppp/api/ppp.common.js');
var processController = require('ofs-ppp-process');
var web = require('Web');
var body = web.request.getBodyObject();
processController.updateMonitoringAndReviewProcessOwner(body.processId, body.notedExceptionId, body.value);
