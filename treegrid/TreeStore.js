(function() {
  var Ext = window.Ext4 || window.Ext;

  var wsapiMaxPageSize = 200;

  /**
   * A data store which can retrieve hierarchical artifact data.  In general this class will not be
   * instantiated directly but will instead be created by Rally.data.wsapi.TreeStoreBuilder:
   *
   *      Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
   *          models: ['userstory'],
   *          autoLoad: true,
   *          enableHierarchy: true
   *      }).then({
   *          success: function(store) {
   *              //use the store
   *          }
   *      });
   *
   * @experimental
   */
  Ext.define('Rally.data.wsapi.TreeStore', {

    // Client Metrics Note: WsapiTreeStore is too low level to record its load begins/ends. The problem is
    // client metrics can only reliably keep track of one load per component at a time. WsapiTreeStore makes
    // no guarantee that only one load will happen at a time. It's better to measure the component that is using
    // the store. All is not lost, the actual data requests that WsapiTreeStore makes *are* measured by client metrics.

    requires: [
      'Deft.promise.Deferred',
      'Rally.data.ModelFactory'
    ],
    extend: 'Ext.data.TreeStore',
    alias: 'store.rallywsapitreestore',
    mixins: {
      messageable: 'Rally.Messageable',
      findRecords: 'Rally.data.WsapiFindRecords',
      recordUpdatable: 'Rally.data.wsapi.RecordUpdatable',
      clientMetrics: 'Rally.clientmetrics.ClientMetricsRecordable'
    },

    statics: {
      wsapiMaxPageSize: wsapiMaxPageSize,

      /**
       * @property
       * @private
       */
      expandedCollectionNames: {
        hierarchicalrequirement: ['Children', 'Defects', 'Tasks','TestCases'],
        defect: ['Tasks','TestCases'],
        defectsuite: ['Defects','Tasks'],
        testset: ['Tasks', 'TestCases']
      },

      /**
       * @property
       * @private
       */
      childToParentTypeMap: {
        defect: ['DefectSuite', 'Requirement'],
        hierarchicalrequirement: ['Parent', 'PortfolioItem'], // NOTE: needs to be added for generic case, but will kill expanding anything but UserStory currently
        task: ['WorkProduct'],
        testcase: ['WorkProduct']
      },

      /**
       * @property
       * @private
       */
      parentChildTypeMap: {
        hierarchicalrequirement: [
          {typePath: 'defect', collectionName: 'Defects'},
          {typePath: 'hierarchicalrequirement', collectionName: 'Children'}, // NOTE: will not work until childToParentTypeMap has hierarchicalrequirement added in
          {typePath: 'task', collectionName: 'Tasks'},
          {typePath: 'testcase', collectionName: 'TestCases'}
        ],
        defect: [
          {typePath: 'task', collectionName: 'Tasks'},
          {typePath: 'testcase', collectionName: 'TestCases'}
        ],
        defectsuite: [
          {typePath: 'task', collectionName: 'Tasks'},
          {typePath: 'testcase', collectionName: 'TestCases'}
        ],
        testset: [
          {typePath: 'task', collectionName: 'Tasks'},
          {typePath: 'testcase', collectionName: 'TestCases', customTraversal: 'TestSet'}
        ]
      },

      isParentType: function(parentType) {
        return _.has(this.parentChildTypeMap, parentType);
      },

      getChildModelTypePaths: function(parentTypes) {
        //console.log('gcmtp', parentTypes);
        return _.reduce(Ext.Array.from(parentTypes), function(childTypes, parentType) {
          //console.log(childTypes, parentType, this.parentChildTypeMap[parentType]);
          return _.union(childTypes, _.pluck(this.parentChildTypeMap[parentType], "typePath"));
        }, [], this);
      }
    },

    /**
     * @cfg {Number}
     * The starting page to be retrieved
     */
    currentPage: 1,

    /**
     * @cfg {Number}
     * The number of records to retrieve per page.
     */
    pageSize: 25,

    /**
     * The data scoping to be applied.
     * @cfg {Object} context
     * @cfg {String} context.workspace The ref of the workspace to scope to
     * @cfg {String} context.project The ref of the project to scope to.  Specify null to query the entire specified workspace.
     * @cfg {Boolean} context.projectScopeUp Whether to scope up the project hierarchy
     * @cfg {Boolean} context.projectScopeDown Whether to scope down the project hierarchy
     */
    context: undefined,

    /**
     * The wsapi version to use when automatically retrieving a model before loading.
     * By default the wsapi version of the specified model is used.
     * @cfg {String/Number} wsapiVersion
     */
    wsapiVersion: undefined,

    nodeParam: undefined,

    /**
     * The model for handling root level and child level items (required)
     * @cfg {@link Rally.domain.WsapiModel} model
     */
    model: undefined,

    /**
     * The attribute types to render as root items (required)
     * @cfg {Array} parentTypes
     */
    parentTypes: [],

    /**
     * @cfg {String[]} fetch
     * The fields to be retrieved using shallowFetch instead of a regular fetch.
     */
    fetch: undefined,

    /**
     * @cfg {Boolean}
     *
     * True to set record's 'leaf' property to true when children are present.
     */
    enableHierarchy: false,

    /**
     * @property
     * @private
     */
    childLevelSorters: [],

    /**
     * @cfg {Boolean}
     *
     * False to have expanding nodes ignore Project Scope settings.
     */
    expandingNodesRespectProjectScoping: true,

    _getModelFromTypePath: function (typePath) {
      if (!this.modelTypePathMap) {
        this.modelTypePathMap = _.transform(this.models, function (r, m) { r[m.typePath] = m; }, {}, this);
      }

      return this.modelTypePathMap[typePath];
    },

    constructor: function(config) {
      this.callParent(arguments);
      if (this.parentTypes.length === 0 || !this.model) {
        Ext.Error.raise('You must configure the tree store with parentTypes and a model');
      }

      if (this.enableHierarchy) {
        this.childLevelSorters = [
        //   {
        //   property: 'TaskIndex',
        //   direction: 'ASC'
        // },
        {
          property: Rally.data.Ranker.getRankField(this.model),
          direction: 'ASC'
        }
        ];
      }
      this.fetch = this._buildFetch(this.fetch, this.model);

      this.addEvents(
        /**
         * @event error
         * Fires when a store load comes back with errors
         * @param {String[]} errors
         */
        'error',

        /**
         * @event currentPageReset
         * Fires when the store determines that the current page needs to be reset to the first page of results
         */
        'currentPageReset',

        'parenttypeschange'
      );

      this._decorateModels();
      this.on('beforeexpand', this.onBeforeExpandNode, this);
      this.on('load', function () {
        this.expandingNode = null;
      }, this);
    },

    onBeforeExpandNode: function (node, eOpts) {
      this.expandingNode = node;
      //console.log('expanding', node);
    },

    isHierarchyEnabled: function() {
      return this.enableHierarchy === true;
    },

    setRootNode: function(root, preventLoad) {
      this.tree.on('rootchange', this._decorateModels, this, {single: true});
      this.callParent([root, preventLoad || !this.autoLoad]);
    },

    setParentTypes: function (parentTypes) {
      this.parentTypes = _.map(Ext.Array.from(parentTypes), function (t) { return t.toLowerCase(); });
      this.fireEvent('parenttypeschange', this.parentTypes);
    },

    remove: function(records) {
      _.invoke(Ext.Array.from(records), 'remove');
    },

    indexOf: function(record) {
      return this.getRootNode().indexOf(record);
    },

    insert: function(index, records) {
      _.each(Ext.Array.from(records), function(record) {
        this.getRootNode().insertChild(index, record);
      }, this);
    },

    getAllParentFieldTypes: function() {
      // going from this --> { defect: ['a', 'b'], userstory: ['c'] }
      // to this         --> ['a', 'b', 'c']
      // the apply() is necessary, because values() will return an array of arrays,
      // and union() wants individual arguments

      var parentFieldNames = [];
      if(this.enableHierarchy) {
        //console.log('gct', this.getChildTypes());
        _.each(this.getChildTypes(), function (type) {
          parentFieldNames = _.union(parentFieldNames, this.getParentFieldTypesByChildType(type.toLowerCase()));
        }, this);
      }

      //console.log('pfn', parentFieldNames);
      var entp = this.getExpandingNodeTypePath().toLowerCase();

      if (entp === 'hierarchicalrequirement') {
        //console.log('US -> US');
        parentFieldNames = _.difference(parentFieldNames, ['PortfolioItem']);
      }

      if (entp.indexOf('portfolioitem') >= 0 && _.contains(this.getChildTypes(), 'hierarchicalrequirement')) {
        //console.log('PI -> US');
        parentFieldNames = ['PortfolioItem'];
      }
      //console.log('pfn after', parentFieldNames);

      return parentFieldNames;
    },

    getParentFieldTypesByChildType: function(childType) {
      //var model = this.model.getArtifactComponentModel(childType);
      var model = this._getModelFromTypePath(childType);
      //console.log(childType);
      return _.filter(this.self.childToParentTypeMap[childType.toLowerCase()], function(field) {
        if (_.isFunction(this.model.getArtifactComponentModel)) {
          return this.model.getArtifactComponentModel(field) || model.hasField(field);
        } else {
          return model.hasField(field);
        }
      }, this);
    },

    getExpandingNodeTypePath: function () {
      var r = this.parentTypes[0];

      //console.log('this.expandingNode', this.expandingNode);
      //console.log('isRoot', this.isRootNode(this.expandingNode));
      if (this.expandingNode && !this.isRootNode(this.expandingNode)) {
        r = this.expandingNode.get('_type');
      }

      //console.log('gentp', r.toLowerCase());
      return r.toLowerCase();
    },

    getChildTypes: function() {
      if(this.enableHierarchy) {
        if (this.expandingNode && this.isRootNode(this.expandingNode)) {
          //return _.intersection(this._getModelTypePaths(), this.self.getChildModelTypePaths(this.parentTypes));
          //console.log('returning parentTypes', this.parentTypes);
          return this.parentTypes;
        }
        //console.log('gct', this.getExpandingNodeTypePath(), this.self.getChildModelTypePaths(this.getExpandingNodeTypePath()), this.self.expandedCollectionNames);

        return this.self.getChildModelTypePaths(Ext.Array.from(this.getExpandingNodeTypePath()));
      }
      return [];
    },

    _getModelTypePaths: function() {
      if(_.isFunction(this.model.getArtifactComponentModels)) {
        return _.pluck(this.model.getArtifactComponentModels(),'typePath');
      }
      return [this.model.typePath];
    },

    isRootNode: function(node) {
      return _.isEmpty(node) || isNaN(node.get('ObjectID'));
    },

    _getCollectionFetchNames: function() {
      var collectionFetchNames = [];
      // Honestly not sure why I need to do this :)
      if (this.isRootNode(this.expandingNode)) {
        _.each(Ext.Array.from(this.parentTypes), function (type) {
          collectionFetchNames = _.union(collectionFetchNames, this.self.expandedCollectionNames[type.toLowerCase()]);
        }, this);
      } else {
        _.each(Ext.Array.from(this.getChildTypes()), function(type) {
          collectionFetchNames = _.union(collectionFetchNames, _.pluck(this.self.parentChildTypeMap[type], "collectionName"));
        },this);
      }
      return collectionFetchNames;
    },

    _decorateModels: function() {
      if (_.isFunction(this.model.getArtifactComponentModels)) {
        _.each(this.model.getArtifactComponentModels(), Ext.data.NodeInterface.decorate, Ext.data.NodeInterface);
      }
    },

    _errors: [],
    /**
     * @inheritdoc
     */
    load: function(options) {
      this.recordLoadBegin({description: 'tree store load', component: this.requester});

      this._hasErrors = false;

      this.on('beforeload', function(store, operation) {
        delete operation.id;
      }, this, { single: true });

      options = this._configureLoad(options);

      var deferred = Ext.create('Deft.Deferred'),
      originalCallback = options.callback,
      me = this;

      options.callback = function (records, operation, success) {
        me.dataLoaded = true;

        Ext.callback(originalCallback, options.scope || me, arguments);
        options.callback = originalCallback;
        if (success) {
          deferred.resolve(records, operation);
        } else {
          deferred.reject(operation);
        }
      };

      this.callParent([options]);



      return deferred.promise;
    },

    _configureLoad: function(options) {
      options = options || {};

      if (Ext.isFunction(options)) {
        options = {callback: options};
      }

      if (this.isRootNode(options.node)) {
        this._configureProxy(true);
        this._configureTopLevelLoad(options);
      } else {
        if (!this.enableHierarchy) {
          Ext.Error.raise('You cannot load child nodes if hierarchy is not enabled.');
        }

        this._configureProxy(false);
        this._configureChildLoad(options);
      }

      options.useShallowFetch = true; //true;
      options.fetch = options.fetch || this._buildFetch(this.fetch, this.model);

      // HACK: The list of fields can become too long and cause a 413 error. This fixes the error at the cost of a fetch=true
      options.fetch = true;

      //console.log('options', options);
      //console.log('gENTY', this.getExpandingNodeTypePath());
      //console.log('pT', this.parentTypes);
      //console.log(_.contains(this.parentTypes, this.getExpandingNodeTypePath()));

      if (this.expandingNodesRespectProjectScoping ||
          this.isRootNode(this.expandingNode) ||
         (_.contains(this.parentTypes, this.getExpandingNodeTypePath()) && !this.expandingNode)) {
        options.context = this.context;
      } else {
        options.context = this.context;
        if (!options.context) {
          options.context = Rally.getApp().getContext().getDataContext();
        }
        options.context.project = null;
      }
      options.requester = this;

      if (options.clearOnLoad === false) {
        var clearOnLoad = this.clearOnLoad;
        this.clearOnLoad = false;
        this.on('load', function() {
          this.clearOnLoad = clearOnLoad;
        }, this, {single: true});
      }

      return options;
    },

    _configureChildLoad: function(options) {
      options.filters = this._getChildNodeFilters(options.node);
      options.sorters = this.childLevelSorters || [{
        property: Rally.data.Ranker.getRankField(this.model),
        direction: 'ASC'
      }];
    },

    _configureTopLevelLoad: function(options) {
      options.params = options.params || {};
      options.params.pagesize = this.pageSize;
      options.params.start = this.pageSize * (this.currentPage - 1);
      //options.filter = Rally.data.wsapi.Filter.or(_(this.parentTypes).map(function(type) {
        //if (this.self.childToParentTypeMap[type]) {
          //return {
            //property: this.self.childToParentTypeMap[type],
            //operator: '=',
            //value: null
          //};
        //} else {
          //return null;
        //}
      //}, this).filter(function (r) { return r !== null; }).value());
    },

    _getChildNodeFilters: function(node) {
      var childItemTypes = this.self.parentChildTypeMap[node.get('_type')];
      var customTraversal = [];
      if (childItemTypes){
        _.each(childItemTypes, function(childType) {
          if (childType.hasOwnProperty('customTraversal')) {
            customTraversal.push(childType.customTraversal);
          }
        });
      }
      return [
        Rally.data.wsapi.Filter.or(_.map(_.union(this.getAllParentFieldTypes(), customTraversal), function(name) {
        return {
          property: name,
          operator: '=',
          value: node.get('_ref')
        };
      }))
      ];
    },

    filter: function(filters) {
      this.filters.addAll(filters);
      this._resetCurrentPage();
      this.load();
    },

    clearFilter: function(suppressEvent) {
      this._resetCurrentPage();
      this.filters.clear();

      if (!suppressEvent) {
        this.load();
      }
    },

    getAt: function(id) {
      return this.getNodeById(id);
    },

    getTotalCount: function() {
      return this.totalCount;
    },

    nextPage: function() {
      this._setCurrentPage(this.currentPage + 1);
      this.load();
    },

    previousPage: function() {
      this._setCurrentPage(this.currentPage - 1);
      this.load();
    },

    loadPage: function(pageNum) {
      this._setCurrentPage(pageNum);
      this.load();
    },

    _setCurrentPage: function(pageNum) {
      var maxPage = Math.ceil(this.getTotalCount() / this.pageSize);
      this.currentPage = Math.min(Math.max(pageNum, 1), maxPage);
    },

    _resetCurrentPage: function() {
      if (this.dataLoaded === true) {
        this.fireEvent('currentpagereset');
        this.currentPage = 1;
      }
    },

    _hasErrors: false,

    hasErrors: function() {
      return this._hasErrors;
    },

    onProxyLoad: function(operation) {
      if (operation.error && operation.error.errors && operation.error.errors.length > 0) {
        this._hasErrors = true;
        this.fireEvent('error', operation.error.errors);
      } else {
        var resultSet = operation.getResultSet();
        if (resultSet) {
          _.each(resultSet.records, this._instrumentRecord, this);
          if (this.isRootNode(operation.node)) {
            this.totalCount = resultSet.total;
            if (this.totalCount > 0 && resultSet.count === 0 && this._attemptingToResetCurrentPage !== true) {
              this._attemptingToResetCurrentPage = true;
              this._resetCurrentPage();
              this.load();
              return;
            }
          }
        }
      }

      //console.log('onProzyLoad', operation);

      this._attemptingToResetCurrentPage = false;

      if(!this.clearOnLoad && (!operation.node || operation.node === this.getRootNode())) {
        var recordsById = _.indexBy(operation.getRecords(), function(record) { return record.getId(); });
        _.each(Ext.clone(operation.node.childNodes), function(childNode) {
          var record = recordsById[childNode.getId()];
          if(!record) {
            childNode.remove(false);
          } else if(record.get('VersionId') !== childNode.get('VersionId')) {

            var newData = _(record.raw).keys().reduce(function(accum, key) {
              accum[key] = record.get(key);
              return accum;
            }, {});

            childNode.set(newData);
            childNode.commit();
          }
        });
      }

      this.recordLoadEnd();
      this.recordLoadBegin({description: 'tree store after load callParent'});

      this.callParent(arguments);

      // For some reason, when expanding top level stories, the bottom level PI becomes the child.
      // THIS IS A HACK :) --Colin
      _.each(operation.node.childNodes, function (node) { node.childNodes = []; node.data.loaded = false; });

      this.recordLoadEnd();

      if (this.ownerTree) {
        this.ownerTree.fireEvent('afterproxyload');
      }
    },

    /**
     * Calls the specified function for each {@link Ext.data.Model record} in the store, walking down the
     * entire tree.
     *
     * @param {Function} fn The function to call. The {@link Ext.data.Model Record} is passed as the first parameter.
     * Returning `false` aborts and exits the iteration.
     * @param {Object} [scope] The scope (this reference) in which the function is executed.
     * Defaults to the current {@link Ext.data.Model record} in the iteration.
     */
    each: function(fn, scope) {
      this._treeWalkingEach(fn, this.tree.root, scope, true);
    },

    _treeWalkingEach: function(fn, node, scope, ignoreNode) {
      _.each(node.childNodes, function(childNode) {
        if (this._treeWalkingEach(fn, childNode, scope) === false) {
          return false;
        }
      }, this);

      return ignoreNode !== true ? fn.call(scope || node, node) : true;
    },

    /**
     * Returns the record node by id
     * @param {Number/String} id the record id or internal id
     * @return {Ext.data.NodeInterface}
     */
    getNodeById: function(id) {
      return this.callParent(arguments) ||
        this.findExactRecord(id);
    },

    /**
     * Finds a record in the store that matches the given record.
     * @param {Rally.domain.WsapiModel/Object/String/Number} record Record to match against. Can also be an object with a _ref property or a ref string or an id.
     */
    findExactRecord: function(record) {
      var recordId = Rally.util.Ref.getOidFromRef(record) || record;
      return this.getRootNode().findChild(this.model.prototype.idProperty, recordId, true);
    },

    /**
     * Reload the specified record.  The current store filters will also be applied.
     * @param {Rally.data.WsapiModel} record the record to reload
     * @param {Object} options additional options to be applied to the {Ext.data.Operation}.
     * @param {Function} options.success callback - @deprecated - use returned promise instead
     * @param {Function} options.failure callback - @deprecated - use returned promise instead
     * @param {Object} options.scope callback scope - @deprecated - use returned promise instead
     * @return {Deft.Promise(Rally.data.WsapiModel)}
     */
    reloadRecord: function(record, options) {
      options = options || {};
      var deferred = Ext.create('Deft.promise.Deferred'),
      operationConfig = Ext.merge({
        action: 'read',
        limit: 1,
        requester: this,
        context: this.context,
        filters: [{
          property: 'ObjectID',
          value: record.getId()
        }],
        params: {}
      }, options), modelToLoadFrom, recordTypePath;

      if (_.isFunction(this.model.getArtifactComponentModels)) {
        recordTypePath = record.self.typePath;
        if (this.model.getArtifactComponentModel(recordTypePath.toLowerCase())) {
          modelToLoadFrom = this.model;
          operationConfig.params.types = recordTypePath;
        } else {
          modelToLoadFrom = record.self;
        }
      } else {
        modelToLoadFrom = record.self;
      }

      operationConfig.useShallowFetch = true;
      operationConfig.fetch = this.fetch ?
        _.union(this.fetch, _.pluck(modelToLoadFrom.getAssociationFields(), 'name')) :
        this._buildFetch(this.fetch, modelToLoadFrom);

      if (record.parentNode === this.getRootNode()) {
        operationConfig.filters = operationConfig.filters.concat(this.filters.getRange());
      }

      modelToLoadFrom.getProxy().read(Ext.create('Ext.data.Operation', operationConfig), function(op) {
        if(op.wasSuccessful() && op.getRecords() && op.getRecords().length) {
          var record = op.getRecords()[0];
          this._instrumentRecord(record);
          Ext.callback(options.success, options.scope, [record]);
          deferred.resolve(record);
        } else {
          Ext.callback(options.failure, options.scope, [op]);
          deferred.reject(op);
        }
      }, this);

      return deferred.promise;
    },

    /**
     * Determines if a given record matches the store filters and would be placed at the top level of the tree.
     * @param {Rally.domain.WsapiModel} record The record to interrogate
     * @return {Deft.promise.Promise} A promise that resolves to the boolean answer
     */
    doesRecordMatchStoreFilters: function(record) {
      var deferred = Ext.create('Deft.promise.Deferred'),
      operation = new Ext.data.Operation({
        action: 'read',
        fetch: false,
        params: {
          query: Rally.data.wsapi.Filter.and(
            this.filters.getRange().concat([
            new Rally.data.wsapi.Filter({
            property: 'ObjectID',
            operator: '=',
            value: Rally.util.Ref.getOidFromRef(record)
          })
          ])
          ).toString()
        },
        limit: 1,
        requester: this
      }),
      callback = function(operation) {
        deferred.resolve(!_.isEmpty(operation.getRecords()));
      };

      this.proxy.setExtraParam('types', this._getTypesForLevel(true));

      this.model.getProxy().read(operation, callback, this);
      return deferred.promise;
    },

    doesRecordMatchChildTypes: function(record) {
      return _(this.getChildTypes()).invoke('toLowerCase').contains(record.self.typePath.toLowerCase());
    },

    _configureProxy: function (forTopLevel) {
      this.proxy = this.model.getProxy();

      var types = _.isFunction(this.model.getArtifactComponentModels) ? this._getTypesForLevel(forTopLevel) : this.model.elementName;

      this.proxy.setExtraParam('types', types);
    },

    _getTypesForLevel: function(forTopLevel) {
      var types;
      if (forTopLevel) {
        types = this.parentTypes.join(',');
      } else {
        types = this.getChildTypes().join(',');
      }
      return types;
    },

    _instrumentRecord: function(record) {
      var leafCount = this._getLeafCount(record),
      isLeaf = leafCount < 1 || !this.enableHierarchy;

      record.set('leaf', isLeaf);
      record.set('leafCount', leafCount);
    },

    _getLeafCount: function(record) {
      var typePath = record.get('_type').toLowerCase(),
      expandedCollectionNames = Ext.Array.from(this.self.expandedCollectionNames[typePath]);
      //console.log(this.self.expandedCollectionNames, typePath, this.self.expandedCollectionNames[typePath]);

      return _.reduce(expandedCollectionNames, function(accumulator, collectionName) {
        //console.log(collectionName, record.get(collectionName));
        //console.dir(record);
        var collectionVal = record.get(collectionName);
        if (collectionVal && collectionVal.Count) {
          accumulator += collectionVal.Count;
        }

        return accumulator;
      }, 0);
    },

    _buildFetch: function(fetch, model) {
      if(fetch === true) {
        return fetch;
      }
      if(!fetch) {
        fetch = _.pluck(model.getNonCollectionFields(), 'name');
      }
      fetch = _.union(_.isArray(fetch) ? fetch : fetch.split(","), ['ObjectID', 'VersionId']);
      if(this.enableHierarchy && fetch !== true) {
        fetch = _.union(fetch, this._getCollectionFetchNames(), this.getAllParentFieldTypes());
      }

      return _.filter(fetch, function (f) { return f !== undefined; });
    },

    setFetch: function(fetch) {
      this.fetch = this._buildFetch(fetch);
    }
  });
})();
