var pppProcessLogController = (function() {
  'use strict';
  var sp = require('SharePoint');
  var web = require('Web');
  require('Moment');

  //Constants
  var docLibName = ppp.DataDocLibName;
  var processLogsFolderName = ppp.ProcessLogsFolderName;
  var processLogFileExtension = ppp.ProcessLogFileExtension;

  var guidRegex = ppp.guidRegex;
  var isDirtyProcessLogListItem = false;

  var __ensureProcessLogFolder = function(path) {
    var docLib = ppp.getDataDocLib();
    var processLogFolder = ppp.ensureSubFolder(docLib.rootFolder, '/' + processLogsFolderName);
    if (!path) {
      return processLogFolder;
    }

    return ppp.ensureSubFolder(processLogFolder, path);
  };

  var __getProcessLogListItemById = function(processId) {
    if (!guidRegex.test(processId)) {
      throw Error('A PPP Process Id must be in the format of a guid. ' + processId);
    }

    var docLib = ppp.getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileLeafRef')
      .EqualTo(processId + processLogFileExtension)
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .ToString();

    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 1;
    var items = docLib.getItemsByQuery(camlQuery);
    if (!items || items.length < 1) {
      return undefined;
    }
    return items[0];
  };

  var __getProcessLogItemList = function(date) {
    var docList = ppp.getDataLogsSPList();
    var camlQuery = new SPCamlQuery();
    camlQuery.query = '<OrderBy><FieldRef Name="ID" Ascending="FALSE" /></OrderBy>';
    camlQuery.rowLimit = 101;
    return docList.getItemsByQuery(camlQuery);
  };

  var __getProcessLogPath = function(processLogListItem) {
    var url = processLogListItem.url;
    url = url.replace(new RegExp(processLogListItem.name + '$'), '');
    url = url.replace(new RegExp('^' + processLogListItem.getParentList().rootFolder.name + '/' + processLogsFolderName), '');
    return url;
  };

  var addDataLogsItem = function(processLogEntry, processId, processName) {
    if (processLogEntry && processLogEntry.kind) {
      var repList = ppp.getDataLogsSPList();
      if (repList) {
        switch (processLogEntry.kind) {
          case 'ProcessStarted':
          case 'ProcessCompleted':
          case 'ProcessFieldUpdated':
          case 'ProcessNoteUpdated':
          case 'ProcessRejected':
          case 'ActivityMarkedAsNotRequired':
          case 'ProcessUnsigned':
          case 'ProcessDeleted':
          case 'MonitoringAndReviewProcessCompleted':
          case 'MonitoringAndReviewProcessOwnerChanged':
          case 'ProcessNameUpdated':
            var item = repList.items.add();
            if (item) {
              var time = '';
              if (processLogEntry.timeStamp) {
                time = JSON.stringify(processLogEntry.timeStamp).replace(/\"/g, '');
              }
              item.setFieldValue('Title', time || ''); // Single, 255
              item.setFieldValue('meta', JSON.stringify(processLogEntry)); // MultiLine plaintext
              item.setFieldValue('processId', processId); // Single, 20
              item.setFieldValue('processName', processName); // MultiLine plaintext
              item.setFieldValue('kind', processLogEntry.kind); // Single, 150
              item.updateOverwriteVersion();
              isDirtyProcessLogListItem = true;
            }
            break;
          case 'ReportingDataSyncStart':
          case 'ReportingDataSyncCompleted':
            var item2 = repList.items.add();
            if (item2) {
              var time2 = '';
              if (processLogEntry.timeStamp) {
                time2 = JSON.stringify(processLogEntry.timeStamp).replace(/\"/g, '');
              }
              item2.setFieldValue('Title', time2 || ''); // Single, 255
              item2.setFieldValue('meta', JSON.stringify(processLogEntry)); // MultiLine plaintext
              item2.setFieldValue('kind', processLogEntry.kind); // Single, 150
              if (processLogEntry.kind === 'ReportingDataSyncCompleted' && processLogEntry.data && processLogEntry.data.ProcessesSynced) {
                item2.setFieldValue('processName', 'Synced ' + processLogEntry.data.ProcessesSynced + ' processes successfully.');
              }
              item2.updateOverwriteVersion();
              isDirtyProcessLogListItem = true;
            }
            break;
          default:
          // DO NOT LOG
        }
      }
    }
  };

  var addLogEntryForProcess = function(processId, logEntry) {
    return addLogEntryForProcessWithName(processId, (logEntry && logEntry.processName) || 'N/A', logEntry);
  };

  var addLogEntryForProcessWithName = function(processId, processName, logEntry) {
    var li = __getProcessLogListItemById(processId);
    var processLog;
    var spFolder;
    if (li) {
      processLog = JSON.parse(
        li
          .getFile()
          .openBinary()
          .toUtf8String()
      );
      if (!processLog.logEntries) {
        processLog.logEntries = [];
      }
      spFolder = __ensureProcessLogFolder(__getProcessLogPath(li));
    } else {
      var processListItem = ppp.getProcessListItemById(processId);
      if (!processListItem) {
        throw Error('The specified process could not be retrieved: ' + processId);
      }

      processLog = {
        processId: processId,
        logEntries: []
      };
      spFolder = __ensureProcessLogFolder(ppp.getProcessPathByListItem(processListItem).replace(new RegExp(processId + '/$'), ''));
    }

    if (!spFolder) {
      throw Error('Process Log folder was null or undefined.');
    }

    logEntry.timeStamp = new Date();
    logEntry.user = ppp.getCurrentUser();

    processLog.logEntries.unshift(logEntry);
    spFolder.getParentWeb().allowUnsafeUpdates = true;
    spFolder.addFileByUrl(processId + processLogFileExtension, JSON.stringify(processLog), true);
    addDataLogsItem(logEntry, processId, processName);

    return processLog;
  };

  var getProcessLogByProcessId = function(processId) {
    var li = __getProcessLogListItemById(processId);
    if (!li) {
      return undefined;
    }

    return JSON.parse(
      li
        .getFile()
        .openBinary()
        .toUtf8String()
    );
  };

  var getProcessLogs = function(date, currentCacheId) {
    var returnObj = {
      cacheId: '',
      logEntries: []
    };

    // Read from cache only if the client pass a currentCacheId.
    // It's away to byPass the cache. Used by the "refresh logs" or "Get Logs" button in Notifications.
    if (currentCacheId && currentCacheId.length > 0) {
      var cache = web.getItemFromCache(ppp.cacheProcLogs);
      if (cache) {
        var cacheObj = JSON.parse(cache);
        // vvv: dont return data if the client requesting already have a copy of the cache
        if (cacheObj && currentCacheId !== cacheObj.cacheId) {
          return cacheObj;
        } else {
          return undefined;
        }
      }
    }

    var li = __getProcessLogItemList(date);
    if (!li) {
      return undefined;
    }
    for (var ix in li) {
      if (li[ix].fieldValues) {
        if (li[ix].fieldValues.meta) {
          var item = JSON.parse(li[ix].fieldValues.meta);
          if (item) {
            item.processId = li[ix].fieldValues.processId || '';
            item.processName = li[ix].fieldValues.processName || li[ix].fieldValues.ProcessName || '';
            returnObj.logEntries.push(item);
          }
        }
      }
    }

    var exp = moment(new Date());
    exp = exp.add(30, 'minutes');
    returnObj.cacheId = exp;
    web.addItemToCache(ppp.cacheProcLogs, JSON.stringify(returnObj), new Date(exp));

    return returnObj;
  };

  return {
    addLogEntryForProcess: addLogEntryForProcess,
    addLogEntryForProcessWithName: addLogEntryForProcessWithName,
    addDataLogsItem: addDataLogsItem,
    getProcessLogByProcessId: getProcessLogByProcessId,
    getProcessLogs: getProcessLogs
  };
})();

pppProcessLogController;
