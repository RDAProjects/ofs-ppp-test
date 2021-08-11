var pppProcessTemplateController = (function() {
  'use strict';
  var sp = require('SharePoint');

  //Constants
  var docLibName = ppp.DataDocLibName;
  var processTemplatesFolderName = ppp.ProcessTemplatesFolderName;
  var processTemplateFileExtension = ppp.ProcessTemplateFileExtension;
  var jobAidsFolderName = ppp.JobAidsFolderName;

  var guidRegex = ppp.guidRegex;

  var __getProcessTemplateFolder = function(path) {
    var docLib = ppp.getDataDocLib();

    var processTemplateFolder = ppp.getSubFolder(docLib.rootFolder, '/' + processTemplatesFolderName);
    return ppp.getSubFolder(processTemplateFolder, path);
  };

  var __ensureProcessTemplateFolder = function(path) {
    var docLib = ppp.getDataDocLib();
    var processTemplateFolder = ppp.ensureSubFolder(docLib.rootFolder, '/' + processTemplatesFolderName);
    if (!path) {
      return processTemplateFolder;
    }

    return ppp.ensureSubFolder(processTemplateFolder, path);
  };

  var __ensureJobAidsProcessTemplateFolder = function() {
    var docLib = ppp.getDataDocLib();
    var jobAidsTemplateFolder = ppp.ensureSubFolder(docLib.rootFolder, '/' + jobAidsFolderName);
    return ppp.ensureSubFolder(jobAidsTemplateFolder, '/');
  };

  var __getProcessTemplateListItemById = function(processTemplateId) {
    if (!guidRegex.test(processTemplateId)) {
      throw Error('A PPP Process Template Id must be in the format of a guid. ' + processTemplateId);
    }

    var docLib = ppp.getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileLeafRef')
      .EqualTo(processTemplateId + processTemplateFileExtension)
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

  var __getProcessTemplateContainerPath = function(processTemplateListItem) {
    var url = processTemplateListItem.url;
    url = url.replace(new RegExp(processTemplateListItem.name + '$'), '');
    url = url.replace(new RegExp('^' + processTemplateListItem.getParentList().rootFolder.name + '/' + processTemplatesFolderName), '');
    return url;
  };

  var __getAttachment = function(attachment) {
    var a = {
      fileName: attachment.name,
      fileIconUrl: '/_layouts/images/' + attachment.iconUrl || '/_layouts/images/ICGEN.GIF',
      serverRelativeUrl: attachment.serverRelativeUrl
    };
    var createdBy = attachment.author || attachment.createdBy;
    a.createdBy = {
      displayName: createdBy.name,
      loginName: createdBy.loginName,
      email: createdBy.email
    };
    var modifiedBy = attachment.editor || attachment.modifiedBy;
    a.modifiedBy = {
      displayName: modifiedBy.name,
      loginName: modifiedBy.loginName,
      email: modifiedBy.email
    };
    return a;
  };

  var __mapProcessTemplateFileToProcessTemplate = function(processTemplateFile) {
    var result = JSON.parse(processTemplateFile.openBinary().toUtf8String());
    result.activities = result.activities || [];
    result.fields = result.fields || [];
    result.title = processTemplateFile.allProperties['vti_title'] || result.title;
    result.created = processTemplateFile.Created || processTemplateFile.timeCreated;
    var createdBy = processTemplateFile.author || processTemplateFile.createdBy;
    result.createdBy = {
      displayName: createdBy.name,
      loginName: createdBy.loginName,
      email: createdBy.email
    };
    result.version = processTemplateFile.versionLabel || processTemplateFile.uiVersionLabel;
    result.versionComment = processTemplateFile.checkInComment;
    result.status = processTemplateFile.level;
    result.currentVersionNumber = processTemplateFile.currentVersionNumber;
    return result;
  };

  var __mapAttachment = function(jobAidFolderFolder, fileName) {
    if (jobAidFolderFolder) {
      var processTemplateAttachments = jobAidFolderFolder.files.toArray();
      for (var ptA in processTemplateAttachments) {
        if (processTemplateAttachments[ptA].name === fileName) {
          var attachment = processTemplateAttachments[ptA];
          var a = __getAttachment(attachment);
          return a;
        }
      }
    }
  };

  var deleteProcessTemplateById = function(processTemplateId) {
    if (!processTemplateId || !ppp.guidRegex.test(processTemplateId)) {
      throw Error('A process template id must be specified and in the format of a Guid.');
    }

    var processTemplateListItem = __getProcessTemplateListItemById(processTemplateId);
    if (!processTemplateListItem) {
      return false;
    }

    processTemplateListItem.delete(true);
    return true;
  };

  var deleteProcessTemplateContainer = function(path) {
    if (!path) {
      throw Error('A process template container path must be specified.');
    }

    var processTemplateFolder = __getProcessTemplateFolder(path);
    if (!processTemplateFolder) {
      return false;
    }

    processTemplateFolder.delete(true);
    return true;
  };

  var getProcessTemplateById = function(processTemplateId, version) {
    if (!processTemplateId || !ppp.guidRegex.test(processTemplateId)) {
      throw Error('A process template id must be specified and in the format of a Guid.');
    }

    var processTemplateListItem = __getProcessTemplateListItemById(processTemplateId);
    if (!processTemplateListItem) {
      return undefined;
    }

    var processTemplateFile = processTemplateListItem.getFile();
    if (processTemplateFile) {
      processTemplateFile.currentVersionNumber = processTemplateFile.uiVersionLabel;
    }

    if (version && processTemplateFile.uiVersionLabel !== version) {
      var currentVersionNumber = processTemplateFile.uiVersionLabel;
      var versionHistory = processTemplateFile.getVersionHistory();
      processTemplateFile = versionHistory.getVersionFromLabel(version);
      processTemplateFile.currentVersionNumber = currentVersionNumber;
    }

    if (!processTemplateFile) {
      return undefined;
    }

    return __mapProcessTemplateFileToProcessTemplate(processTemplateFile);
  };

  var getProcessTemplateContainerById = function(processTemplateId) {
    if (!processTemplateId || !ppp.guidRegex.test(processTemplateId)) {
      throw Error('A process template id must be specified and in the format of a Guid.');
    }

    var processTemplateListItem = __getProcessTemplateListItemById(processTemplateId);
    if (!processTemplateListItem) {
      return undefined;
    }

    return __getProcessTemplateContainerPath(processTemplateListItem);
  };

  var getProcessTemplateVersionHistoryById = function(processTemplateId) {
    if (!processTemplateId || !ppp.guidRegex.test(processTemplateId)) {
      throw Error('A process template id must be specified and in the format of a Guid.');
    }

    var processTemplateListItem = __getProcessTemplateListItemById(processTemplateId);
    if (!processTemplateListItem) {
      return undefined;
    }

    var processTemplateFile = processTemplateListItem.getFile();
    var versionHistory = processTemplateFile.getVersionHistory().toArray();
    var result = [];
    for (var ix in versionHistory) {
      var version = versionHistory[ix];
      var data = {
        version: version.versionLabel,
        versionComment: version.checkInComment,
        createdOn: version.Created,
        createdBy: {
          displayName: version.createdBy.name,
          loginName: version.createdBy.loginName,
          email: version.createdBy.email
        },
        isCurrentVersion: version.isCurrentVersion
      };
      result.unshift(data);
    }

    result.unshift({
      version: processTemplateFile.uiVersionLabel,
      versionComment: processTemplateFile.checkInComment,
      createdOn: processTemplateFile.timeLastModified,
      createdBy: {
        displayName: processTemplateFile.modifiedBy.name,
        loginName: processTemplateFile.modifiedBy.loginName,
        email: processTemplateFile.modifiedBy.email
      },
      isCurrentVersion: true
    });

    return result;
  };

  var listAllProcessTemplateContainers = function(path) {
    var docLib = ppp.getDataDocLib();

    if (!path) {
      path = '';
    }

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileRef')
      .BeginsWith(docLib.url + '/' + processTemplatesFolderName + path)
      .And()
      .TextField('FSObjType')
      .EqualTo('1')
      .OrderBy('FileRef')
      .ToString();
    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 10000;
    var items = docLib.getItemsByQuery(camlQuery);

    var result = [];
    for (var ix in items) {
      result.push(items[ix].url.replace(new RegExp('^' + docLib.rootFolder.name + '/' + processTemplatesFolderName), '') + '/');
    }

    return result;
  };

  var listAllProcessTemplates = function(path) {
    var containers = listAllProcessTemplateContainers(path);
    var result = {};
    for (var ix in containers) {
      var containerName = containers[ix];
      result[containerName] = listProcessTemplatesInContainer(containerName);
    }
    return result;
  };

  var listProcessTemplatesInContainer = function(path) {
    if (!path) {
      throw Error('A Path must be specified.');
    }

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }

    var docLib = ppp.getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .EqualTo(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + processTemplatesFolderName + path)
      .And()
      .TextField('File_x0020_Type')
      .EqualTo(processTemplateFileExtension.replace('.', ''))
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .OrderBy('FileDirRef')
      .ToString();
    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 10000;
    var items = docLib.getItemsByQuery(camlQuery);

    var result = [];
    for (var ix in items) {
      var li = items[ix];
      var processTemplate = __mapProcessTemplateFileToProcessTemplate(li.getFile());
      result.push(processTemplate);
    }
    return result;
  };

  var moveProcessTemplate = function(processTemplateId, path) {
    if (!processTemplateId) {
      throw Error('A Process Template Id must be specified.');
    }

    if (!path) {
      throw Error('A Path must be specified.');
    }

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }

    var li = __getProcessTemplateListItemById(processTemplateId);
    if (!li) {
      throw Error('A Process Template with the specified id could not be found.');
    }

    var currentPath = __getProcessTemplateContainerPath(li);
    if (currentPath !== path + '/') {
      var spFolder = __ensureProcessTemplateFolder(path);
      spFolder.getParentWeb().allowUnsafeUpdates = true;
      var file = li.getFile();
      file.moveTo(spFolder.url + '/' + file.name, true);
    }

    return __mapProcessTemplateFileToProcessTemplate(file);
  };

  var publishProcessTemplateById = function(processTemplateId, versionComment) {
    var li = __getProcessTemplateListItemById(processTemplateId);
    if (!li) {
      throw Error('A Process Template with the specified Id was not found: ' + processTemplateId);
    }

    var spFile = li.getFile();
    spFile.publish(versionComment || '');
    return __mapProcessTemplateFileToProcessTemplate(spFile);
  };

  var putProcessTemplateContainer = function(path) {
    if (!path) {
      throw Error('A Path must be specified.');
    }

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    var spFolder = __ensureProcessTemplateFolder(path);
    return spFolder.url.replace(new RegExp('^' + spFolder.getDocumentLibrary().rootFolder.name + '/' + processTemplatesFolderName), '');
  };

  var saveProcessTemplateAsDraft = function(path, processTemplate, versionComment) {
    if (!path) {
      throw Error('A Path must be specified.');
    }

    if (!processTemplate) {
      throw Error('A Process Template must be specified.');
    }

    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }

    if (processTemplate.id) {
      var li = __getProcessTemplateListItemById(processTemplate.id);
      if (!li) {
        throw Error('The specified Process Template has an Id but could not be found.');
      }

      var currentPath = __getProcessTemplateContainerPath(li);
      if (currentPath !== path + '/') {
        var spFolder = __ensureProcessTemplateFolder(path);
        spFolder.getParentWeb().allowUnsafeUpdates = true;
        var file = li.getFile();
        file.moveTo(spFolder.url + '/' + file.name, true);
      }
    }

    var spFolder = __ensureProcessTemplateFolder(path);
    processTemplate.id = processTemplate.id || new Guid().toString();
    if (!ppp.guidRegex.test(processTemplate.id)) {
      throw Error('A Process Template id must be in the format of a guid. ' + processTemplate.id);
    }

    // Put the Process Template data.
    spFolder.getParentWeb().allowUnsafeUpdates = true;
    var file = spFolder.addFileByUrl(processTemplate.id + processTemplateFileExtension, JSON.stringify(processTemplate), true);
    if (file.checkOutType === 'None') {
      file.checkOut();
    }

    // Update Properties.
    var li = file.getListItem();
    li.setFieldValue('Title', processTemplate.title);

    // Check it back in.
    li.updateOverwriteVersion();
    if (versionComment) {
      file.checkIn(versionComment, 'OverwriteCheckIn');
    } else {
      file.checkIn('', 'OverwriteCheckIn');
    }

    return __mapProcessTemplateFileToProcessTemplate(file);
  };

  var uploadProcessTemplateAttachment = function(processTemplateId, fileName, file, activityId) {
    if (!file) {
      throw 'A file argument must be supplied.';
    }
    var processTemplateListItem = __getProcessTemplateListItemById(processTemplateId);
    if (!processTemplateListItem) {
      return undefined;
    }

    var spFolder = __ensureJobAidsProcessTemplateFolder();
    spFolder.getParentWeb().allowUnsafeUpdates = true;
    file.fileName = fileName;
    spFolder.addFile(file, true);

    return __mapAttachment(spFolder, fileName);
  };

  var removeProcessTemplateAttachment = function(processTemplateId, fileName, activityId) {
    var processTemplateListItem = __getProcessTemplateListItemById(processTemplateId);
    if (!processTemplateListItem) {
      return undefined;
    }
    var spFolder = __ensureJobAidsProcessTemplateFolder();
    var web = spFolder.getParentWeb();
    var spFile = web.getFileByServerRelativeUrl(web.serverRelativeUrl + '/' + spFolder.url + '/' + fileName);
    if (spFile && spFile.exists === true) {
      web.allowUnsafeUpdates = true;
      spFile.delete(true);
      return { id: processTemplateId, fileName: fileName };
    }
    return undefined;
  };

  return {
    deleteProcessTemplateById: deleteProcessTemplateById,
    deleteProcessTemplateContainer: deleteProcessTemplateContainer,
    getProcessTemplateById: getProcessTemplateById,
    getProcessTemplateContainerById: getProcessTemplateContainerById,
    getProcessTemplateVersionHistoryById: getProcessTemplateVersionHistoryById,
    listAllProcessTemplateContainers: listAllProcessTemplateContainers,
    listAllProcessTemplates: listAllProcessTemplates,
    listProcessTemplatesInContainer: listProcessTemplatesInContainer,
    moveProcessTemplate: moveProcessTemplate,
    publishProcessTemplateById: publishProcessTemplateById,
    putProcessTemplateContainer: putProcessTemplateContainer,
    saveProcessTemplateAsDraft: saveProcessTemplateAsDraft,
    uploadProcessTemplateAttachment: uploadProcessTemplateAttachment,
    removeProcessTemplateAttachment: removeProcessTemplateAttachment
  };
})();

pppProcessTemplateController;
