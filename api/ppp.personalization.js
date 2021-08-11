var pppPersonalizationController = (function() {
  'use strict';
  var sp = require('SharePoint');
  var web = require('Web');

  //Constants
  var DataDocLibName = ppp.DataDocLibName;
  var personalizationFolderName = ppp.PersonalizationFolderName;
  var personalizationGlobalFolderName = ppp.PersonalizationGlobalFolderName;
  var filterFolderName = ppp.FilterFolderName;

  var FilterFileExtension = ppp.FilterFileExtension;

  var docLibObj = null;

  var guidRegex = new RegExp(/^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/);

  var __getDataDocLib = function() {
    if (docLibObj) {
      return docLibObj;
    }

    var web = sp.currentContext.web;
    docLibObj = web.lists.getListByListName(DataDocLibName);
    return docLibObj;
  };

  var __ensurePersonalizationFolder = function(path) {
    var docLib = __getDataDocLib();
    var personalizationFolder = __ensureSubFolder(docLib.rootFolder, '/' + personalizationFolderName);
    if (!path) {
      return personalizationFolder;
    }

    return __ensureSubFolder(personalizationFolder, path);
  };

  var getFilterListItemById = function(filterId) {
    if (!guidRegex.test(filterId)) {
      throw Error('A PPP filter Id must be in the format of a guid. ' + filterId);
    }

    var docLib = __getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileLeafRef')
      .EqualTo(filterId + FilterFileExtension)
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

  var getUserConfigListItemById = function() {
    var docLib = __getDataDocLib();
    var user = sp.currentContext.web.currentUser.name.replace('\\', '-');
    var camlBuilder = new SPCamlQueryBuilder();
    var fileName = ppp.userConfigurationFileName + ppp.configurationFileExtension;
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + personalizationFolderName + '/' + user + '/' + ppp.userConfigurationsFolderName)
      .And()
      .TextField('FileLeafRef')
      .EqualTo(fileName)
      .And()
      .TextField('FSObjType')
      .EqualTo('0')
      .ToString();

    var camlQuery = new SPCamlQuery();
    camlQuery.query = caml;
    camlQuery.viewAttributes = "Scope='RecursiveAll'";
    camlQuery.rowLimit = 1;
    var items = docLib.getItemsByQuery(camlQuery);
    if (items && items.length > 0) {
      return items[0];
    }
    return undefined;
  };

  var __ensureSubFolder = function(spFolder, subFolderPath) {
    if (!subFolderPath.startsWith('/')) {
      subFolderPath = '/' + subFolderPath;
    }

    var parentWeb = spFolder.getParentWeb();
    var rootUri = new Uri((parentWeb.url + '/' + spFolder.url).toString(), 'Absolute');
    var targetUri = new Uri((parentWeb.url + '/' + spFolder.url + subFolderPath).toString(), 'Absolute');
    var segments = targetUri.segments;

    var currentFolder = spFolder;
    for (var i = rootUri.segments.length; i < segments.length; i++) {
      currentFolder = currentFolder.ensureSubFolderExists(segments[i]);
    }

    return currentFolder;
  };

  var saveFilter = function(filter, global) {
    if (!filter.name) {
      throw Error('A filter name is required');
    }

    if (!filter.filterSet) {
      throw Error('A filter set is required');
    }

    var savedFilter = {
      id: new Guid().toString(),
      name: filter.name,
      filterSet: filter.filterSet
    };

    var user = sp.currentContext.web.currentUser.name.replace('\\', '-');

    var spFolder = __ensurePersonalizationFolder();

    var filterFolder = null;

    if (global) {
      // check user in admin group
      if (ppp.isAdministrator(user)) {
        var globalFolder = __ensureSubFolder(spFolder, '/' + personalizationGlobalFolderName);
        filterFolder = __ensureSubFolder(globalFolder, '/' + filterFolderName);
      } else {
        throw Error('Insufficient Permissions to add to global personalization.');
      }
    } else if (!global) {
      var userFolder = __ensureSubFolder(spFolder, '/' + user);
      filterFolder = __ensureSubFolder(userFolder, '/' + filterFolderName);
    }

    if (filterFolder) {
      filterFolder.getParentWeb().allowUnsafeUpdates = true;
      var file = filterFolder.addFileByUrl(savedFilter.id + FilterFileExtension, JSON.stringify(savedFilter));

      var filterListItem = file.getListItem();
      filterListItem.setFieldValue('Title', savedFilter.name);

      return file;
    } else {
      throw Error('Folder error');
    }
  };

  var saveNotificationsToken = function(value) {
    // Default UserConfiguration
    var defaultUserConfiguration = {
      notificationsSection: {
        lastToken: new Date(),
        includeOwns: true
      }
    };
    var userConfig;
    var listItem = getUserConfigListItemById();
    if (listItem) {
      userConfig = __mapFile(listItem.getFile());
    }
    if (userConfig) {
      userConfig.notificationsSection.lastToken = new Date();
    } else {
      userConfig = defaultUserConfiguration;
    }

    var user = sp.currentContext.web.currentUser.name.replace('\\', '-');
    var spFolder = __ensurePersonalizationFolder();
    var userFolder = __ensureSubFolder(spFolder, '/' + user);
    var tokenFolder = __ensureSubFolder(userFolder, '/' + ppp.userConfigurationsFolderName);
    if (tokenFolder) {
      tokenFolder.getParentWeb().allowUnsafeUpdates = true;
      tokenFolder.addFileByUrl(ppp.userConfigurationFileName + ppp.configurationFileExtension, JSON.stringify(userConfig), true);
      return userConfig;
    } else {
      throw Error('Folder error');
    }
  };

  var saveIncludeOwn = function() {
    // Default UserConfiguration
    var defaultUserConfiguration = {
      notificationsSection: {
        lastToken: new Date(),
        includeOwns: true
      }
    };
    var userConfig;
    var listItem = getUserConfigListItemById();
    if (listItem) {
      userConfig = __mapFile(listItem.getFile());
    }
    if (userConfig) {
      userConfig.notificationsSection.includeOwns = value;
    } else {
      userConfig = defaultUserConfiguration;
    }

    var user = sp.currentContext.web.currentUser.name.replace('\\', '-');
    var spFolder = __ensurePersonalizationFolder();
    var userFolder = __ensureSubFolder(spFolder, '/' + user);
    var tokenFolder = __ensureSubFolder(userFolder, '/' + ppp.userConfigurationsFolderName);
    if (tokenFolder) {
      tokenFolder.getParentWeb().allowUnsafeUpdates = true;
      tokenFolder.addFileByUrl(ppp.userConfigurationFileName + ppp.configurationFileExtension, JSON.stringify(userConfig), true);
      return userConfig;
    } else {
      throw Error('Folder error');
    }
  };

  var __mapFile = function(filterFile) {
    var result = JSON.parse(filterFile.openBinary().toUtf8String());
    return result;
  };

  var getGlobalFilters = function() {
    var docLib = __getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + personalizationFolderName + '/' + personalizationGlobalFolderName + '/' + filterFolderName)
      .And()
      .TextField('File_x0020_Type')
      .EqualTo(FilterFileExtension.replace('.', ''))
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
    var filter = {};
    for (var ix in items) {
      var li = items[ix];

      filter = __mapFile(li.getFile());
      result.push(filter);
    }

    return result;
  };

  var getPersonalFilters = function() {
    var docLib = __getDataDocLib();

    var camlBuilder = new SPCamlQueryBuilder();
    var caml = camlBuilder
      .Where()
      .TextField('FileDirRef')
      .BeginsWith(docLib.parentWebUrl + '/' + docLib.rootFolder.name + '/' + personalizationFolderName + '/' + sp.currentContext.web.currentUser.name.replace('\\', '-') + '/' + filterFolderName)
      .And()
      .TextField('File_x0020_Type')
      .EqualTo(FilterFileExtension.replace('.', ''))
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
    var filter = null;
    for (var ix in items) {
      var li = items[ix];

      filter = __mapFile(li.getFile());
      result.push(filter);
    }

    return result;
  };

  var getFilterById = function(id) {
    var listItem = getFilterListItemById(id);
    if (!listItem) {
      return undefined;
    }

    return __mapFile(listItem.getFile());
  };

  var getUserConfig = function() {
    var listItem = getUserConfigListItemById();
    if (listItem) {
      return __mapFile(listItem.getFile());
    } else {
      return saveNotificationsToken();
    }
  };

  var deleteFilterById = function(id) {
    var filter = getFilterListItemById(id);
    var user = sp.currentContext.web.currentUser.name.replace('\\', '-');
    if (!filter) {
      return false;
    }
    if (filter.fieldValues.FileRef.indexOf('/Global/') > 0) {
      if (ppp.isAdministrator(user)) {
        filter.delete(true);
        return true;
      } else {
        throw new Error('Insufficient Permissions to delete this filter');
      }
    }
    return filter.delete(true);
  };

  return {
    saveFilter: saveFilter,
    getGlobalFilters: getGlobalFilters,
    getPersonalFilters: getPersonalFilters,
    getFilterById: getFilterById,
    deleteFilterById: deleteFilterById,
    saveNotificationsToken: saveNotificationsToken,
    saveIncludeOwn: saveIncludeOwn,
    getUserConfig: getUserConfig
  };
})();

pppPersonalizationController;
