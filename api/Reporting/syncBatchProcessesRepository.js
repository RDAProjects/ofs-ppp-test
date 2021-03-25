include('/ofsppp/api/ppp.common.js');
var reportingController = require('ofs-ppp-reporting');
var web = require('Web');
var body = web.request.getBodyObject();

reportingController.syncBatchProcessesRepository(body.processes);
