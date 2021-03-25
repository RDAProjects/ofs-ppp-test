var pppReportingController = (function() {
  'use strict';
  var sp = require('SharePoint');
  var web = require('Web');
  var repList = ppp.getReportingDocLib();

  var syncClearList = function(toDelete) {
    var itemsDeleted = 0;
    if (!repList) {
      repList = ppp.getReportingDocLib();
    }
    if (repList) {
      var items = repList.getItems();
      for (var i = 0; i < items.length; i++) {
        items[i].delete();
        itemsDeleted++;
        if (toDelete && i > toDelete) {
          break;
        }
      }
    }
    return itemsDeleted;
  };

  var syncBatchProcessesRepository = function(processes) {
    var procCount = 0;
    var processErrors = [];
    if (processes) {
      // add all current items
      var list = processes;
      if (list && Array.isArray(list)) {
        for (var i = 0; i < list.length; i++) {
          var ret = processController.syncProcessInstance(list[i]);
          if (ret.completed && ret.completed === true) {
            procCount++;
          } else {
            processErrors.push(ret);
          }
        }
      }
    }
    return { processInstanceCount: procCount, processInError: processErrors };
  };

  return {
    syncClearList: syncClearList,
    syncBatchProcessesRepository: syncBatchProcessesRepository
  };
})();

pppReportingController;
