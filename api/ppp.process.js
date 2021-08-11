var pppProcessController = (function() {
  'use strict';
  var sp = require('SharePoint');
  var web = require('Web');
  require('Moment');

  var repList = ppp.getReportingDocLib();

  //Constants
  var cacheID = ppp.cacheID;
  var cacheFY = ppp.cacheFY;
  var cacheListAll = ppp.cacheListAll;
  var slidingExp = ppp.slidingExp;
  var slidingResultsetExp = ppp.slidingResultsetExp;
  var htmlRegex = RegExp(/(<([^>]+)>)/gi);
  var processesFolderName = ppp.ProcessesFolderName;
  var processFileExtension = ppp.ProcessFileExtension;
  var notedExceptionFolderName = ppp.notedExceptionFolderName;

  var guidRegex = ppp.guidRegex;

  var __ensureProcessesFolder = function(path) {
    var docLib = ppp.getDataDocLib();
    var processesFolder = ppp.ensureSubFolder(docLib.rootFolder, '/' + processesFolderName);
    if (!path) {
      return processesFolder;
    }

    return ppp.ensureSubFolder(processesFolder, path);
  };

  var __getProcessActivityTuple = function(processId, activityId) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (!guidRegex.test(activityId)) {
      throw Error('A PPP Activity Id must be in the format of a guid. ' + activityId);
    }

    if (!process.activities || !barista.isArray(process.activities)) {
      throw Error('The process did not contain any activities: ' + processId);
    }

    var activityTemplate;
    for (var ix in process.template.activities) {
      var a = process.template.activities[ix];
      if (a.id === activityId) {
        activityTemplate = a;
        break;
      }
    }

    var activity;
    for (var ix in process.activities) {
      var a = process.activities[ix];
      if (a.id === activityId) {
        activity = a;
        break;
      }
    }

    if (!activity) {
      throw Error('The process did not contain an activity with the specified id: ' + activityId);
    }

    return {
      processListItem: processListItem,
      process: process,
      activityTemplate: activityTemplate,
      activity: activity
    };
  };

  var __updateProcessByTuple = function(processId, tuple) {
    var file = __updateProcess(processId, tuple.process, tuple.processListItem);
    return __mapProcessFileToProcess(file);
  };

  var __updateProcess = function(processId, process, processListItem, processPath) {
    if (!processPath) {
      processPath = ppp.getProcessPathByListItem(processListItem).substring(1);
    }

    if (processPath.endsWith('/')) {
      processPath = processPath.substring(0, processPath.length - 1);
    }

    process.id = processId;

    var spFolder = __ensureProcessesFolder(processPath);
    spFolder.getParentWeb().allowUnsafeUpdates = true;
    var file = spFolder.addFileByUrl(processId + processFileExtension, JSON.stringify(process), true);

    // Update Properties.
    processListItem = file.getListItem();
    processListItem.setFieldValue('Title', process.name);

    // Overwrite to update the list item.
    processListItem.updateOverwriteVersion();

    // Refresh cache item
    cacheClearResultsets();
    web.removeItemFromCache(cacheID + processListItem.id);
    // Sync Reporting ItemList
    // syncProcessInstance(process);

    return file;
  };

  var cacheClearResultsets = function() {
    web.removeItemFromCache(cacheListAll);
    var years = ppp.getYears();
    years.forEach(function(year) {
      web.removeItemFromCache(cacheFY + ppp.getFedFiscalYearForYear(year));
    });
  };

  var __getProcessCompletionStatus = function(tuple) {
    for (var ix in tuple.process.activities) {
      var activity = tuple.process.activities[ix];
      if (activity.status === 'NotRequired') {
        continue;
      }

      if (activity.status !== 'Complete' || (tuple.activityTemplate.requiresReview === true && !tuple.activity.reviewedBy)) {
        return 'Active';
      }
    }

    if (tuple.process.signOff == null) {
      return 'CompletedNotSigned';
    }

    return 'CompletedAndSigned';
  };

  var getAvailableFiscalYears = function() {
    var docLib = ppp.getDataDocLib();
    var processesFolder = ppp.ensureSubFolder(docLib.rootFolder, '/' + processesFolderName);
    var fiscalYearFolders = processesFolder.subFolders.toArray();
    var fiscalYears = [];

    for (var i = 0; i < fiscalYearFolders.length; i++) {
      fiscalYears.push(fiscalYearFolders[i].name);
    }

    return fiscalYears;
  };

  var __mapProcessFileToProcess = function(processFile) {
    var result = JSON.parse(processFile.openBinary().toUtf8String());
    //return result;
    result.name = result.name || processFile.allProperties['vti_title'];
    result.functionArea = ppp.getProcessPathByListItem(processFile.getListItem());
    result.functionArea = result.functionArea.replace(/^\/FY\d+\//, '');
    result.functionArea = result.functionArea.replace(/\/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\/$/, '');

    result.initiatedOn = processFile.Created || processFile.timeCreated;

    var initiatedBy = processFile.author || processFile.createdBy;
    result.initiatedBy = {
      displayName: initiatedBy.name,
      loginName: initiatedBy.loginName,
      email: initiatedBy.email
    };

    result.modified = processFile.Modified || processFile.timeLastModified;
    var modifiedBy = processFile.editor || processFile.modifiedBy;
    result.modifiedBy = {
      displayName: modifiedBy.name,
      loginName: modifiedBy.loginName,
      email: modifiedBy.email
    };

    var parentFolder = processFile.getParentFolder();

    for (var ix in result.activities) {
      var activity = result.activities[ix];
      //activity.attachments = [];
      var activityFolder = ppp.getSubFolder(parentFolder, '/' + activity.id);
      if (activityFolder) {
        var activityAttachments = activityFolder.files.toArray();
        for (var jx in activityAttachments) {
          var activityAttachment = activityAttachments[jx];
          var a = {
            fileName: activityAttachment.name,
            originalFileName: getOriginalFileName(activity.attachments, activityAttachment.name),
            //activity.attachments[ix] ? (activity.attachments[ix].originalFileName ? activity.attachments[ix].originalFileName : activityAttachment.name) : activityAttachment.name,
            fileIconUrl: '/_layouts/images/' + activityAttachment.iconUrl || '/_layouts/images/ICGEN.GIF',
            serverRelativeUrl: activityAttachment.serverRelativeUrl
          };

          a.created = processFile.timeCreated;
          var createdBy = activityAttachment.author || activityAttachment.createdBy;
          a.createdBy = {
            displayName: createdBy.name,
            loginName: createdBy.loginName,
            email: createdBy.email
          };

          a.modified = processFile.timeLastModified;
          var modifiedBy = activityAttachment.editor || activityAttachment.modifiedBy;
          a.modifiedBy = {
            displayName: modifiedBy.name,
            loginName: modifiedBy.loginName,
            email: modifiedBy.email
          };

          var index = getNodeIndex(activity.attachments, activityAttachment.name);
          if (index > -1) {
            activity.attachments[index] = a;
          } else {
            activity.attachments.push(a);
          }
        }
      }
    }
    return result;
  };

  var getNodeIndex = function(jsonAttachmentNodeArr, fileName) {
    var index = -1;
    for (var i in jsonAttachmentNodeArr) {
      if (jsonAttachmentNodeArr[i].fileName === fileName) {
        index = i;
        break;
      }
    }
    return index;
  };

  var getOriginalFileName = function(jsonAttachmentNodeArr, fileName) {
    var originalFileName = fileName;
    for (var i in jsonAttachmentNodeArr) {
      if (jsonAttachmentNodeArr[i].fileName === fileName) {
        originalFileName = jsonAttachmentNodeArr[i].originalFileName ? jsonAttachmentNodeArr[i].originalFileName : fileName;
      }
    }
    return originalFileName;
  };

  var createProcessFromProcessTemplate = function(processTemplateId, version, processName, transactionDate, fiscalYear, relatedRejectedProcessInstance) {
    if (!fiscalYear) {
      fiscalYear = ppp.getFedFiscalYearForDate();
    }

    var processTemplate = processTemplateController.getProcessTemplateById(processTemplateId, version);
    if (!processTemplate) {
      throw Error('The specified process template could not be retrieved: ' + processTemplateId + ' ' + version);
    }

    var newProcess = {
      id: new Guid().toString(),
      template: processTemplate,
      name: processName,
      transactionDate: transactionDate,
      status: 'Initiated',
      signOff: null,
      fields: [],
      activities: [],
      notes: '',
      relatedRejectedProcessInstance: relatedRejectedProcessInstance
    };

    for (var ix in processTemplate.fields) {
      var fieldTemplate = processTemplate.fields[ix];
      newProcess.fields.push({
        id: fieldTemplate.id,
        name: fieldTemplate.name,
        value: ''
      });
    }

    for (var ix in processTemplate.activities) {
      var activityTemplate = processTemplate.activities[ix];
      newProcess.activities.push({
        id: activityTemplate.id,
        responsibleParty: activityTemplate.responsibleParty,
        status: 'Incomplete',
        reviewedBy: null,
        attachments: [],
        comments: ''
      });
    }

    var processTemplateContainer = processTemplateController.getProcessTemplateContainerById(processTemplateId);
    var processPath = '/' + fiscalYear + processTemplateContainer + newProcess.id;
    var file = __updateProcess(newProcess.id, newProcess, null, processPath);

    // Add the created log entry.
    processLogController.addLogEntryForProcessWithName(newProcess.id, newProcess.name, {
      kind: 'ProcessStarted'
    });

    return __mapProcessFileToProcess(file);
  };

  var deleteProcessById = function(processId) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      return false;
    }

    // Remove item from cache.
    web.removeItemFromCache(cacheID + processListItem.id);
    cacheClearResultsets();

    processLogController.addLogEntryForProcess(processId, {
      kind: 'ProcessDeleted'
    });

    processListItem.delete(true);
    return true;
  };

  var cacheClearByProcessId = function(processId) {
    // Remove item from cache.
    web.removeItemFromCache(cacheID + processId);
    cacheClearResultsets();
  };

  var getProcessById = function(processId) {
    var li = ppp.getProcessListItemById(processId);
    if (!li) {
      return undefined;
    }

    var process = __mapProcessFileToProcess(li.getFile());
    process.fiscalYear = li.fiscalYear;
    return process;
  };

  /* get process path by item id */
  var getProcessPathByProcessId = function(processId) {
    var li = ppp.getProcessListItemById(processId);
    return ppp.getFullProcessPathByListItem(li);
  };

  var listAllProcesses = function() {
    var cacheResultset = web.getItemFromCache(cacheListAll);
    if (cacheResultset) {
      return JSON.parse(cacheResultset);
    }

    var docLib = ppp.getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + processesFolderName)
      .And()
      .TextField('File_x0020_Type')
      .EqualTo(processFileExtension.replace('.', ''))
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .ToString();
    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 10000;
    var items = docLib.getItemsByQuery(camlQuery);

    var result = [];
    for (var ix in items) {
      var li = items[ix];
      var fy = li.url.replace(new RegExp('^' + docLib.rootFolder.name + '/' + processesFolderName + '/(FY..).*'), '$1');
      var processTemplate = {};
      var cacheItem = web.getItemFromCache(cacheID + li.id);
      if (cacheItem) {
        processTemplate = JSON.parse(cacheItem);
        processTemplate.fiscalYear = fy;
      } else {
        processTemplate = __mapProcessFileToProcess(li.getFile());
        processTemplate.fiscalYear = fy;
        web.addItemToCache(cacheID + li.id, processTemplate, null, slidingExp); // since we are here, just add it to the cache. It may affect performance, TODO: compare perf.
      }
      result.push(processTemplate);
    }
    web.addItemToCache(cacheListAll, result, null, slidingResultsetExp); // since we are here, just add it to the cache. It may affect performance, TODO: compare perf.

    return result;
  };

  var listAllProcessesForFiscalYear = function(fiscalYear) {
    if (!fiscalYear) {
      fiscalYear = ppp.getFedFiscalYearForDate();
    }

    if (!fiscalYear.startsWith('/')) {
      fiscalYear = '/' + fiscalYear;
    }

    if (!fiscalYear.endsWith('/')) {
      fiscalYear = fiscalYear + '/';
    }

    var cacheResultset = web.getItemFromCache(cacheFY + fiscalYear);
    if (cacheResultset) {
      return JSON.parse(cacheResultset);
    }

    var docLib = ppp.getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + processesFolderName + fiscalYear)
      .And()
      .TextField('File_x0020_Type')
      .EqualTo(processFileExtension.replace('.', ''))
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .ToString();
    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 10000;
    var items = docLib.getItemsByQuery(camlQuery);

    var result = [];
    for (var ix in items) {
      var li = items[ix];
      var processTemplate = {};
      var cacheItem = web.getItemFromCache(cacheID + li.id);
      if (cacheItem) {
        processTemplate = JSON.parse(cacheItem);
      } else {
        processTemplate = __mapProcessFileToProcess(li.getFile());
        web.addItemToCache(cacheID + li.id, processTemplate, null, slidingExp); // since we are here, just add it to the cache. It may affect performance, TODO: compare perf.
      }
      result.push(processTemplate);
    }

    web.addItemToCache(cacheFY + fiscalYear, result, null, slidingResultsetExp); // since we are here, just add it to the cache. It may affect performance, TODO: compare perf.

    return result;
  };

  var listAllProcessesForFiscalYears = function(fiscalYears) {
    fiscalYears = JSON.parse(fiscalYears);
    var results = [];
    var docLib = ppp.getDataDocLib();
    for (var i = 0; i < fiscalYears.length; i++) {
      var fiscalYear = fiscalYears[i];
      var cacheResultset = web.getItemFromCache(cacheFY + fiscalYear);
      if (cacheResultset) {
        results = results.concat(JSON.parse(cacheResultset));
      } else {
        var camlBuilder = new SPCamlQueryBuilder();
        var caml = camlBuilder
          .Where()
          .TextField('FileDirRef')
          .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + processesFolderName + '/' + fiscalYear)
          .And()
          .TextField('File_x0020_Type')
          .EqualTo(processFileExtension.replace('.', ''))
          .And()
          .TextField('FSObjType')
          .EqualTo('0')
          .ToString();
        var camlQuery = new SPCamlQuery();
        camlQuery.query = caml;
        camlQuery.viewAttributes = "Scope='RecursiveAll'";
        camlQuery.rowLimit = 10000;
        var items = docLib.getItemsByQuery(camlQuery);
        var result = [];
        for (var ix in items) {
          var li = items[ix];
          var process = {};
          var cacheItem = web.getItemFromCache(cacheID + li.id);
          if (cacheItem) {
            process = JSON.parse(cacheItem);
          } else {
            process = __mapProcessFileToProcess(li.getFile());
            web.addItemToCache(cacheID + li.id, process, null, slidingExp); // since we are here, just add it to the cache. It may affect performance, TODO: compare perf.
          }
          result.push(process);
        }
        results = results.concat(result);
        web.addItemToCache(cacheFY + fiscalYear, result, null, slidingResultsetExp); // since we are here, just add it to the cache. It may affect performance, TODO: compare perf.
      }
    }
    return results;
  };

  var cacheAllProcesses = function() {
    var docLib = ppp.getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + processesFolderName)
      .And()
      .TextField('File_x0020_Type')
      .EqualTo(processFileExtension.replace('.', ''))
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .ToString();
    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 10000;
    var items = docLib.getItemsByQuery(camlQuery);
    for (var ix in items) {
      var li = items[ix];
      var processTemplate = __mapProcessFileToProcess(li.getFile());
      web.addItemToCache(cacheID + li.id, processTemplate, null, slidingExp);
    }
    return web.getItemsInCache();
  };

  var cacheRemoveByProcessId = function(processId) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      return false;
    }

    // Remove item from cache.
    web.removeItemFromCache(cacheID + processListItem.id);
    return true;
  };

  var cacheRemoveByKey = function(key) {
    // Remove item from cache.
    web.removeItemFromCache(key);
    return true;
  };

  var getCachedProcesses = function() {
    return web.getItemsInCache();
  };

  var moveProcessToAnotherFiscalYear = function(processId, toFiscalYear) {
    var msg = '';

    if (ppp.isSysAdmin() === false) {
      throw Error('Permission Denied.');
    }

    if (!processId) {
      throw Error('A Process Id must be specified.');
    }

    if (!toFiscalYear) {
      throw Error('A fiscal Year must be specified.');
    }

    if (!toFiscalYear.startsWith('FY')) {
      throw Error('The fiscal Year is invalid. Must start with FY');
    }

    if (toFiscalYear.length !== 4) {
      throw Error('The fiscal Year is invalid. Must start with FY followed by two digits.');
    }

    var li = ppp.getProcessListItemById(processId);
    if (!li) {
      throw Error('A Process  with the specified id could not be found.');
    }
    var docLib = ppp.getDataDocLib();
    var fromFiscalYear = li.url.replace(new RegExp('^' + docLib.rootFolder.name + '/' + ppp.ProcessesFolderName + '/(FY..).*'), '$1');

    if (fromFiscalYear.length === 4 && toFiscalYear !== fromFiscalYear) {
      // Add the created log entry.
      processLogController.addLogEntryForProcess(processId, {
        kind: 'FiscalYearMoveFromStarted',
        data: { from: fromFiscalYear, to: toFiscalYear }
      });
      var pathDest = ppp.getProcessPathByListItem(li);
      pathDest = pathDest.replace(fromFiscalYear, toFiscalYear);
      __ensureProcessesFolder(pathDest.replace('/' + processId, '')); // do not include the processItem folder itself
      var sourceFolderUrl = li.fieldValues.EncodedAbsUrl;
      sourceFolderUrl = sourceFolderUrl.replace('/' + processId + '.ppp', ''); // remove filename
      var f = new SPFolder(sourceFolderUrl);
      f.moveTo(sourceFolderUrl.replace(fromFiscalYear, toFiscalYear));

      // Add the created log entry.
      processLogController.addLogEntryForProcess(processId, {
        kind: 'FiscalYearMoveFromCompleted',
        data: { from: fromFiscalYear, to: toFiscalYear }
      });

      // Refresh cache item
      processController.cacheClearByProcessId(processId);
      msg = 'Completed process [' + processId + ']  move from ' + fromFiscalYear + ' to ' + toFiscalYear;
    } else {
      msg = 'Process was not moved.';
    }
    return msg;
  };

  var __getProcessContainerPath = function(processListItem) {
    var url = processListItem.url;
    url = url.replace(new RegExp(processListItem.name + '$'), '');
    url = url.replace(new RegExp('^' + processListItem.getParentList().rootFolder.name + '/' + processTemplatesFolderName), '');
    return url;
  };

  var markProcessActivityAsComplete = function(processId, activityId) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    if (tuple.activityTemplate.requiresReview) {
      tuple.activity.status = 'CompleteRequiresReview';
    } else {
      tuple.activity.status = 'Complete';
    }

    tuple.activity.reviewedBy = null;
    tuple.activity.completedBy = ppp.getCurrentUser();
    tuple.activity.completedOn = new Date();
    tuple.process.signOff = null;
    tuple.process.status = __getProcessCompletionStatus(tuple);

    var result = __updateProcessByTuple(processId, tuple);

    processLogController.addLogEntryForProcessWithName(processId, result.name, {
      kind: 'ActivityMarkedAsComplete',
      activityId: activityId
    });

    return result;
  };

  var markProcessActivityAsIncomplete = function(processId, activityId) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    tuple.activity.status = 'Incomplete';
    tuple.activity.reviewedBy = null;
    tuple.activity.completedBy = null;
    tuple.activity.completedOn = null;
    tuple.process.signOff = null;
    tuple.process.status = __getProcessCompletionStatus(tuple);

    var result = __updateProcessByTuple(processId, tuple);

    processLogController.addLogEntryForProcessWithName(processId, result.name, {
      kind: 'ActivityMarkedAsIncomplete',
      activityId: activityId
    });

    return result;
  };

  var markProcessActivityAsNotRequired = function(processId, activityId, comments) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    tuple.activity.status = 'NotRequired';

    if (!tuple.activity.ActivityNotRequiredInfoSet) {
      tuple.activity.ActivityNotRequiredInfoSet = [];
    }

    // if (tuple.activity.notRequiredSet) {
    //   tuple.activity.ActivityNotRequiredInfoSet.push(
    //     tuple.activity.notRequiredSet);
    //   delete tuple.activity.notRequiredSet;
    // }

    tuple.activity.ActivityNotRequiredInfoSet.push({
      byUser: ppp.getCurrentUser(),
      onDate: new Date(),
      comments: comments
    });

    tuple.activity.reviewedBy = null;
    tuple.activity.completedBy = null;
    tuple.activity.completedOn = null;
    tuple.process.signOff = null;
    tuple.process.status = __getProcessCompletionStatus(tuple);

    var result = __updateProcessByTuple(processId, tuple);

    processLogController.addLogEntryForProcessWithName(processId, result.name, {
      kind: 'ActivityMarkedAsNotRequired',
      activityId: activityId
    });

    return result;
  };

  var markProcessActivityAsReviewed = function(processId, activityId) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    if (tuple.activity.completedBy == ppp.getCurrentUser()) {
      throw new Error('Activity Reviewer cannot be the same as Activity Completer');
    }

    tuple.activity.status = 'Complete';
    tuple.activity.reviewedBy = ppp.getCurrentUser();
    tuple.activity.reviewedOn = new Date();
    tuple.process.signOff = null;
    tuple.process.status = __getProcessCompletionStatus(tuple);

    var result = __updateProcessByTuple(processId, tuple);

    processLogController.addLogEntryForProcessWithName(processId, result.name, {
      kind: 'ActivityMarkedAsNotRequired',
      activityId: activityId
    });

    return result;
  };

  var removeProcessActivityAttachment = function(processId, activityId, fileName) {
    var tuple = __getProcessActivityTuple(processId, activityId);
    var processPath = ppp.getProcessPathByListItem(tuple.processListItem).substring(1);
    processPath = processPath.substring(0, processPath.length - 1);
    var spFolder = __ensureProcessesFolder(processPath + '/' + activityId);
    var parentWeb = spFolder.getParentWeb();
    var spFile = parentWeb.getFileByServerRelativeUrl(parentWeb.serverRelativeUrl + '/' + spFolder.url + '/' + fileName);
    if (spFile && spFile.exists === true) {
      parentWeb.allowUnsafeUpdates = true;
      var serverRelativeUrl = spFile.serverRelativeUrl;
      spFile.delete(true);

      //also delete json reference from .ppp file
      for (var ix in tuple.activity.attachments) {
        var a = tuple.activity.attachments[ix];
        if (a.fileName === fileName) {
          tuple.activity.attachments.splice(ix, 1);
          break;
        }
      }
      //update process
      var result = __updateProcessByTuple(processId, tuple);

      // return test;
      processLogController.addLogEntryForProcess(processId, {
        kind: 'ActivityAttachmentRemoved',
        activityId: activityId,
        fileName: fileName,
        serverRelativeUrl: serverRelativeUrl
      });
    }
    return;
  };

  var unsignProcess = function(processId, reason) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (process.status !== 'CompletedAndSigned') {
      throw Error('The specified process is already unsigned');
    }

    delete process.signOff;
    process.status = 'CompletedNotSigned';
    process.unSigned = true;

    var file = __updateProcess(processId, process, processListItem);

    processLogController.addLogEntryForProcessWithName(processId, process.name, { kind: 'ProcessUnsigned', reason: reason });

    return __mapProcessFileToProcess(file);
  };

  var signCompletedProcess = function(processId) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (process.activities && process.activities.length > 0 && process.status !== 'CompletedNotSigned' && process.status !== 'CompletedAndSigned') {
      throw Error('The specified process cannot be signed as it has not been completed.');
    }

    process.signOff = {
      signer: ppp.getCurrentUser(),
      timeStamp: new Date()
    };
    process.status = 'CompletedAndSigned';

    if (process.unSigned) {
      delete process.unSigned;
    }

    var file = __updateProcess(processId, process, processListItem);

    processLogController.addLogEntryForProcessWithName(processId, process.name, {
      kind: 'ProcessCompleted'
    });

    return __mapProcessFileToProcess(file);
  };

  var rejectProcess = function(processId, reason) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    process.rejection = {
      reason: reason,
      rejectedBy: ppp.getCurrentUser(),
      timeStamp: new Date()
    };
    process.status = 'Rejected';

    var file = __updateProcess(processId, process, processListItem);

    processLogController.addLogEntryForProcessWithName(processId, process.name, {
      kind: 'ProcessRejected'
    });

    return __mapProcessFileToProcess(file);
  };

  var updateProcessFieldValue = function(processId, fieldId, fieldValue) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (!guidRegex.test(fieldId)) {
      throw Error('A PPP Field Id must be in the format of a guid. ' + fieldId);
    }

    if (!process.fields || !barista.isArray(process.fields)) {
      throw Error('The process did not contain any fields: ' + processId);
    }

    var fieldTemplate;
    for (var ix in process.template.fields) {
      var f = process.template.fields[ix];
      if (f.id === fieldId) {
        fieldTemplate = f;
        break;
      }
    }

    var field;
    for (var ix in process.fields) {
      var f = process.fields[ix];
      if (f.id === fieldId) {
        field = f;
        break;
      }
    }

    if (!field) {
      throw Error('The process did not contain an field with the specified id: ' + fieldId);
    }

    var oldValue = fieldValue;
    field.value = fieldValue;

    var file = __updateProcess(processId, process, processListItem);
    var response = __mapProcessFileToProcess(file);

    processLogController.addLogEntryForProcessWithName(processId, response.name, {
      kind: 'ProcessFieldUpdated',
      fieldId: fieldId,
      fieldOldValue: oldValue,
      fieldNewValue: fieldValue
    });

    return response;
  };

  var updateProcessNotes = function(processId, notes) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    var oldValue = process.notes;
    process.notes = notes;

    var file = __updateProcess(processId, process, processListItem);
    var response = __mapProcessFileToProcess(file);

    processLogController.addLogEntryForProcessWithName(processId, response.name, {
      kind: 'ProcessNoteUpdated',
      noteOldValue: oldValue,
      noteNewValue: notes
    });

    return response;
  };

  var updateMonitoringAndReviewQuestions = function(processId, monitoringAndReview) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (process && process.monitoringAndReview && process.monitoringAndReview.status === 'Completed') {
      throw Error('Monitoring and Review cannot be updated when its status is Completed.');
    }

    var oldValue = process.monitoringAndReview;
    if (process.monitoringAndReview) {
      process.monitoringAndReview.q1 = monitoringAndReview.q1;
      process.monitoringAndReview.q2 = monitoringAndReview.q2;
      process.monitoringAndReview.q3 = monitoringAndReview.q3;
      process.monitoringAndReview.q4 = monitoringAndReview.q4;
    } else {
      process.monitoringAndReview = {
        q1: monitoringAndReview.q1,
        q2: monitoringAndReview.q2,
        q3: monitoringAndReview.q3,
        q4: monitoringAndReview.q4
      };
    }
    process.monitoringAndReview.status = 'InProgress';

    // check date and user is added to notherExceptions
    for (var ix in process.monitoringAndReview.notedExceptions) {
      var f = process.monitoringAndReview.notedExceptions[ix];
      if (!f.exceptionNotedBy || f.exceptionNotedBy === '') {
        f.exceptionNotedBy = ppp.getCurrentUser();
      }
      if (!f.exceptionNotedTimeStamp || f.exceptionNotedTimeStamp === '') {
        f.exceptionNotedTimeStamp = new Date();
      }
    }

    var newValue = process.monitoringAndReview;

    var file = __updateProcess(processId, process, processListItem);
    var response = __mapProcessFileToProcess(file);

    processLogController.addLogEntryForProcessWithName(processId, response.name, {
      kind: 'MonitoringAndReview',
      monitoringAndReviewOldValue: oldValue,
      monitoringAndReviewNewValue: newValue
    });

    return response;
  };

  var updateMonitoringAndReviewNotes = function(processId, generalNotes) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (process && process.monitoringAndReview && process.monitoringAndReview.status === 'Completed') {
      throw Error('Monitoring and Review cannot be updated when its status is Completed.');
    }

    var oldValue = process.monitoringAndReview;
    if (process.monitoringAndReview) {
      process.monitoringAndReview.generalNotes = generalNotes;
    } else {
      process.monitoringAndReview = {
        generalNotes: generalNotes
      };
    }
    process.monitoringAndReview.status = 'InProgress';

    // check date and user is added to notherExceptions
    for (var ix in process.monitoringAndReview.notedExceptions) {
      var f = process.monitoringAndReview.notedExceptions[ix];
      if (!f.exceptionNotedBy || f.exceptionNotedBy === '') {
        f.exceptionNotedBy = ppp.getCurrentUser();
      }
      if (!f.exceptionNotedTimeStamp || f.exceptionNotedTimeStamp === '') {
        f.exceptionNotedTimeStamp = new Date();
      }
    }
    var newValue = process.monitoringAndReview;

    var file = __updateProcess(processId, process, processListItem);
    var response = __mapProcessFileToProcess(file);

    processLogController.addLogEntryForProcessWithName(processId, response.name, {
      kind: 'MonitoringAndReview',
      monitoringAndReviewOldValue: oldValue,
      monitoringAndReviewNewValue: newValue
    });

    return response;
  };

  var updateMonitoringAndReviewNotedExceptions = function(processId, notedExceptions) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (process && process.monitoringAndReview && process.monitoringAndReview.status === 'Completed') {
      throw Error('Monitoring and Review cannot be updated when its status is Completed.');
    }

    var oldValue = process.monitoringAndReview;
    if (process.monitoringAndReview) {
      process.monitoringAndReview.notedExceptions = notedExceptions;
    } else {
      process.monitoringAndReview = {
        notedExceptions: notedExceptions
      };
    }
    process.monitoringAndReview.status = 'InProgress';

    // check date and user is added to notherExceptions
    for (var ix in process.monitoringAndReview.notedExceptions) {
      var f = process.monitoringAndReview.notedExceptions[ix];
      if (!f.exceptionNotedBy || f.exceptionNotedBy === '') {
        f.exceptionNotedBy = ppp.getCurrentUser();
      }
      if (!f.exceptionNotedTimeStamp || f.exceptionNotedTimeStamp === '') {
        f.exceptionNotedTimeStamp = new Date();
      }
    }

    var newValue = process.monitoringAndReview;

    var file = __updateProcess(processId, process, processListItem);
    var response = __mapProcessFileToProcess(file);

    processLogController.addLogEntryForProcessWithName(processId, response.name, {
      kind: 'MonitoringAndReview',
      monitoringAndReviewOldValue: oldValue,
      monitoringAndReviewNewValue: newValue
    });

    return response;
  };

  var updateMonitoringAndReviewProcessOwner = function(processId, notedExceptionId, value) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (!process.monitoringAndReview) {
      throw Error('The specified process cannot be completed as not all data has been captured.');
    }

    if (process && process.monitoringAndReview && process.monitoringAndReview.status.toLowerCase() === 'completed') {
      throw Error('Monitoring and Review cannot be updated when its status is Completed.');
    }

    process.monitoringAndReview.status = 'InProgress';

    var notedException;
    for (var ix in process.monitoringAndReview.notedExceptions) {
      var a = process.monitoringAndReview.notedExceptions[ix];
      if (a.id === notedExceptionId) {
        notedException = a;
        break;
      }
    }
    if (notedException) {
      notedException.processOwnerResponse = value;
      notedException.processOwnerResponseTimeStamp = new Date();
      notedException.processOwner = ppp.getCurrentUser();
    }

    var file = __updateProcess(processId, process, processListItem);

    processLogController.addLogEntryForProcessWithName(processId, process.name, {
      kind: 'MonitoringAndReviewProcessOwnerChanged'
    });

    return __mapProcessFileToProcess(file);
  };

  var markMonitoringAndReviewCompletedProcess = function(processId) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    if (!process.monitoringAndReview) {
      throw Error('The specified process cannot be completed as not all data has been captured.');
    }

    if (process.monitoringAndReview.signOff && process.monitoringAndReview.signOff.timeStamp) {
      throw Error('Monitoring and Review already completed.');
    }

    if (process.monitoringAndReview.status === 'Completed') {
      throw Error('Monitoring and Review cannot be updated when its status is Completed.');
    }

    if (process.monitoringAndReview.q1 && process.monitoringAndReview.q2 && process.monitoringAndReview.q3) {
      process.monitoringAndReview.status = 'Completed';
    } else {
      throw Error('The specified process cannot be completed as it doesnt have all data.');
    }

    process.monitoringAndReview.signOff = {
      signer: ppp.getCurrentUser(),
      timeStamp: new Date()
    };

    var file = __updateProcess(processId, process, processListItem);

    processLogController.addLogEntryForProcessWithName(processId, process.name, {
      kind: 'MonitoringAndReviewProcessCompleted'
    });

    return __mapProcessFileToProcess(file);
  };

  var updateProcessName = function(processId, name) {
    var processListItem = ppp.getProcessListItemById(processId);
    if (!processListItem) {
      throw Error('A process with the specified id could not be located: ' + processId);
    }

    var process = JSON.parse(
      processListItem
        .getFile()
        .openBinary()
        .toUtf8String()
    );

    var oldValue = process.name;
    process.name = name;

    var file = __updateProcess(processId, process, processListItem);

    processLogController.addLogEntryForProcessWithName(processId, name, {
      kind: 'ProcessNameUpdated',
      data: { from: oldValue, to: name }
    });

    return __mapProcessFileToProcess(file);
  };

  var updateProcessActivityComments = function(processId, activityId, comments) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    tuple.activity.comments = comments;

    var result = __updateProcessByTuple(processId, tuple);

    processLogController.addLogEntryForProcessWithName(processId, result.name, {
      kind: 'ActivityCommentUpdated',
      activityId: activityId
    });

    return result;
  };

  var updateProcessActivityResponsibleParty = function(processId, activityId, responsibleParty) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    tuple.activity.responsibleParty = responsibleParty;

    var result = __updateProcessByTuple(processId, tuple);

    processLogController.addLogEntryForProcessWithName(processId, result.name, {
      kind: 'ActivityResponsiblePartyUpdated',
      activityId: activityId
    });

    return result;
  };

  var uploadProcessActivityAttachment = function(processId, activityId, fileName, originalFileName, file) {
    if (!file) {
      throw 'A file argument must be supplied.';
    }

    var tuple = __getProcessActivityTuple(processId, activityId);
    var processPath = ppp.getProcessPathByListItem(tuple.processListItem).substring(1);
    processPath = processPath.substring(0, processPath.length - 1);
    var spFolder = __ensureProcessesFolder(processPath + '/' + activityId);
    spFolder.getParentWeb().allowUnsafeUpdates = true;
    file.fileName = fileName;
    spFolder.addFile(file, true);

    //update process joson
    var result = updateFileAttachmentInfo(processId, fileName, originalFileName);

    processLogController.addLogEntryForProcess(processId, {
      kind: 'ActivityAttachmentUploaded',
      activityId: activityId,
      fileName: fileName,
      serverRelativeUrl: file.serverRelativeUrl
    });

    return result;
    // return __mapProcessFileToProcess(tuple.processListItem.getFile());
  };

  var uploadNotedExceptionAttachment = function(processId, notedExceptionId, fileName, originalFileName, file) {
    if (!file) {
      throw 'A file argument must be supplied.';
    }

    var li = ppp.getProcessListItemById(processId);
    var processPath = ppp.getProcessPathByListItem(li).substring(1);
    var attachment = {};
    var spFolder = __ensureProcessesFolder(processPath + notedExceptionFolderName);
    spFolder.getParentWeb().allowUnsafeUpdates = true;
    file.fileName = fileName;
    spFolder.addFile(file, true);

    attachment = {
      fileName: fileName,
      originalFileName: originalFileName,
      serverRelativeUrl: spFolder.serverRelativeUrl + '/' + file.fileName,
      createBy: ppp.getCurrentUser(),
      modifiedBy: ppp.getCurrentUser()
    };

    processLogController.addLogEntryForProcess(processId, {
      kind: 'NotedExceptionAttachmentUploaded',
      notedExceptionId: notedExceptionId,
      fileName: fileName,
      serverRelativeUrl: file.serverRelativeUrl
    });

    return attachment;
  };

  var updateFileAttachmentInfo = function(processId, fileName, originalFileName) {
    var tuple = __getProcessActivityTuple(processId, activityId);

    tuple.activity.attachments.push({ fileName: fileName, originalFileName: originalFileName });

    var result = __updateProcessByTuple(processId, tuple);

    if (!tuple) {
      throw Error('There is no process with the specified process id: ' + processId);
    }
    return result;
  };

  var trimStr = function(str, length) {
    if (str && typeof str === 'string') {
      return str.substring(0, length);
    }
    return '';
  };

  var getProcessActivityAttachmentFile = function(processId, activityId, fileName) {
    var tuple = __getProcessActivityTuple(processId, activityId);
    var processPath = ppp.getProcessPathByListItem(tuple.processListItem).substring(1);
    processPath = processPath.substring(0, processPath.length - 1);
    var spFolder = __ensureProcessesFolder(processPath + '/' + activityId);
    var web = spFolder.getParentWeb();
    var spFile = web.getFileByServerRelativeUrl(web.serverRelativeUrl + '/' + spFolder.url + '/' + fileName);
    if (spFile && spFile.exists === true) {
      return spFile;
    }
    throw Error('Not Found');
  };

  var addListItem = function(p, a, activityNumer) {
    var format = 'YYYY-MM-DD';
    if (!repList) {
      repList = ppp.getReportingDocLib();
    }

    if (repList && p && a) {
      var templateActivity = getActivity(p.template.activities, a.id);
      var item = repList.items.add();
      if (item) {
        item.setFieldValue('Title', p.id + '_' + a.id);
        item.setFieldValue('ProcessId', p.id);
        if (p.transactionDate) {
          item.setFieldValue('TransactionDate', trimStr(moment(p.transactionDate).format(format), 255));
        }
        if (p.fiscalYear) {
          item.setFieldValue('FiscalYear', p.fiscalYear);
        }
        item.setFieldValue('ProcessName', trimStr(p.name, 255));
        item.setFieldValue('FunctionArea', trimStr(p.functionArea), 255);
        item.setFieldValue('ProcessType', trimStr(p.template ? p.template.title : '', 255));
        // ProcessType
        item.setFieldValue('Status', p.status);
        if (p.signOff) {
          item.setFieldValue('SignOffDate', p.signOff.timeStamp ? moment(p.signOff.timeStamp).format(format) : '');
          item.setFieldValue('SignOffUser', trimStr(p.signOff.signer ? p.signOff.signer.displayName : '', 255));
        }
        if (p.rejection) {
          item.setFieldValue('RejectionReason', trimStr(p.rejection.reason ? p.rejection.reason : '', 255));
          item.setFieldValue('RejectionDate', trimStr(p.rejection.timeStamp ? moment(p.rejection.timeStamp).format(format) : '', 255));
          item.setFieldValue('RejectionUser', trimStr(p.rejection.rejectedBy ? p.rejection.rejectedBy.displayName : '', 255));
        }
        item.setFieldValue('ModifiedBy', trimStr(p.modifiedBy ? p.modifiedBy : '', 255));
        if (p.unSigned) {
          item.setFieldValue('UnSigned', p.unSigned);
        }
        item.setFieldValue('Notes', p.notes ? p.notes.replace(htmlRegex, '') : '');
        if (p.initiatedOn) {
          item.setFieldValue('InitiatedOn', trimStr(p.initiatedOn ? moment(p.initiatedOn).format(format) : '', 255));
        }
        if (p.initiatedBy) {
          item.setFieldValue('initiatedBy', trimStr(p.initiatedBy.displayName, 255));
        }
        if (p.relatedRejectedProcessInstance) {
          item.setFieldValue('RelatedRejectedProcessInstanceId', p.relatedRejectedProcessInstance.id);
          item.setFieldValue('RelatedRejectedName', trimStr(p.relatedRejectedProcessInstance.name, 255));
        }

        item.setFieldValue('ActivityId', a.id);
        item.setFieldValue('ActivitySequence', activityNumer);
        item.setFieldValue('ActivityStatus', trimStr(a.status, 255));
        item.setFieldValue('ActivityResponsibleParty', trimStr(a.responsibleParty, 255));

        if (a.reviewedBy) {
          item.setFieldValue('ActivityReviewedBy', trimStr(a.reviewedBy ? a.reviewedBy.displayName : '', 255));
        }
        if (a.reviewedOn) {
          item.setFieldValue('ActivityReviewedOn', trimStr(a.reviewedOn ? moment(a.reviewedOn).format(format) : '', 255));
        }
        if (a.completedBy) {
          item.setFieldValue('ActivityCompletedBy', trimStr(a.completedBy.displayName ? a.completedBy.displayName : '', 255));
        }
        if (a.completedOn) {
          item.setFieldValue('ActivityCompletedOn', trimStr(moment(a.completedOn).format(format), 255));
        }
        if (a.notRequiredSet) {
          item.setFieldValue('ActivityNotRequiredSetUser', trimStr(a.notRequiredSet.byUser.displayName, 255));
          item.setFieldValue('ActivityNotRequiredSetDate', trimStr(a.notRequiredSet.onDate ? moment(a.notRequiredSet.onDate).format(format) : '', 255));
        }
        item.setFieldValue('ActivityComments', a.comments ? a.comments.replace(htmlRegex, '') : '');
        if (templateActivity) {
          item.setFieldValue('ActivityDescription', templateActivity.description ? templateActivity.description.replace(htmlRegex, '') : '');
          item.setFieldValue('ActivityTooltip', templateActivity.tooltip ? templateActivity.tooltip.replace(htmlRegex, '') : '');
          item.setFieldValue('ActivityDependsOnPrevActivity', templateActivity.dependsOnPreviousActivity);
        }

        //m and r
        if (p.monitoringAndReview) {
          item.setFieldValue('MandR Status', trimStr(p.monitoringAndReview.status, 255));
          if (p.monitoringAndReview.signOff) {
            item.setFieldValue('MandR Signoff Date', trimStr(p.monitoringAndReview.signOff.timeStamp ? moment(p.monitoringAndReview.signOff.timeStamp).format(format) : '', 255));
            item.setFieldValue('MandR Signoff By', trimStr(p.monitoringAndReview.signOff.signer.displayName, 255));
          }
          item.setFieldValue('MandR Exception Exists', p.monitoringAndReview.notedExceptions && p.monitoringAndReview.notedExceptions.length > 0 ? 'Yes' : 'No');
        }
        item.updateOverwriteVersion();
      }
    }
  };

  var getActivity = function(activities, id) {
    var returnActivity;
    if (id) {
      for (var ii = 0; ii < activities.length; ii++) {
        var aid = activities[ii].id.toUpperCase();
        if (aid === id.toUpperCase()) {
          returnActivity = activities[ii];
        }
      }
    }
    return returnActivity;
  };

  var syncProcessInstance = function(process) {
    repList = ppp.getReportingDocLib();
    if (!repList || repList === null) {
      repList = ppp.getReportingDocLib();
    }
    if (repList) {
      for (var n = 0; n < process.activities.length; n++) {
        // activities
        try {
          var a = process.activities[n];
          addListItem(process, a, n + 1);
        } catch (err) {
          return {
            completed: false,
            errorDetails: err,
            activity: process.activities[n],
            process: process
          };
        }
      }
    }
    return {
      completed: true
    };
  };

  var syncStartCompleted = function(rowCount) {
    var logEntry = {
      timeStamp: new Date(),
      user: ppp.getCurrentUser()
    };
    if (rowCount && rowCount > 0) {
      logEntry.kind = 'ReportingDataSyncCompleted';
      logEntry.data = { ProcessesSynced: rowCount };
    } else {
      logEntry.kind = 'ReportingDataSyncStart';
      logEntry.data = {};
    }
    processLogController.addDataLogsItem(logEntry, undefined, undefined);
  };

  return {
    createProcessFromProcessTemplate: createProcessFromProcessTemplate,
    deleteProcessById: deleteProcessById,
    getAvailableFiscalYears: getAvailableFiscalYears,
    getProcessById: getProcessById,
    getProcessPathByProcessId: getProcessPathByProcessId,
    getCachedProcesses: getCachedProcesses,
    cacheAllProcesses: cacheAllProcesses,
    cacheRemoveByProcessId: cacheRemoveByProcessId,
    cacheRemoveByKey: cacheRemoveByKey,
    cacheClearByProcessId: cacheClearByProcessId,
    cacheClearResultsets: cacheClearResultsets,
    listAllProcesses: listAllProcesses,
    listAllProcessesForFiscalYear: listAllProcessesForFiscalYear,
    listAllProcessesForFiscalYears: listAllProcessesForFiscalYears,
    markProcessActivityAsComplete: markProcessActivityAsComplete,
    markProcessActivityAsIncomplete: markProcessActivityAsIncomplete,
    markProcessActivityAsNotRequired: markProcessActivityAsNotRequired,
    markProcessActivityAsReviewed: markProcessActivityAsReviewed,
    markMonitoringAndReviewCompletedProcess: markMonitoringAndReviewCompletedProcess,
    removeProcessActivityAttachment: removeProcessActivityAttachment,
    signCompletedProcess: signCompletedProcess,
    unsignProcess: unsignProcess,
    rejectProcess: rejectProcess,
    updateProcessActivityComments: updateProcessActivityComments,
    updateProcessActivityResponsibleParty: updateProcessActivityResponsibleParty,
    updateProcessNotes: updateProcessNotes,
    updateProcessName: updateProcessName,
    updateProcessFieldValue: updateProcessFieldValue,
    uploadProcessActivityAttachment: uploadProcessActivityAttachment,
    uploadNotedExceptionAttachment: uploadNotedExceptionAttachment,
    updateMonitoringAndReviewNotes: updateMonitoringAndReviewNotes,
    updateMonitoringAndReviewProcessOwner: updateMonitoringAndReviewProcessOwner,
    updateMonitoringAndReviewQuestions: updateMonitoringAndReviewQuestions,
    updateMonitoringAndReviewNotedExceptions: updateMonitoringAndReviewNotedExceptions,
    getProcessActivityAttachmentFile: getProcessActivityAttachmentFile,
    syncProcessInstance: syncProcessInstance,
    syncStartCompleted: syncStartCompleted,
    moveProcessToAnotherFiscalYear: moveProcessToAnotherFiscalYear
  };
})();

pppProcessController;
