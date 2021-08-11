include('/ofsppp/api/ppp.common.js');
var personalizationController = require('ofs-ppp-personalization');
var web = require('Web');

var filterId = web.request.queryString.filterId;

personalizationController.getFilterById(filterId);
