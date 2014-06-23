(function() {
  var Ext = window.Ext4 || window.Ext;

  /**
   * Constructs Rally.data.wsapi.TreeStore instances.
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
  Ext.define('Rally.data.wsapi.TreeStoreBuilder', {
    extend: 'Rally.data.DataStoreBuilder',
    requires: [
      'Rally.data.wsapi.TreeStore',
      'Rally.data.ModelFactory'
    ],

    build: function(config) {
      config = _.clone(config || {});
      config.storeType = 'Rally.data.wsapi.TreeStore';

      return this.callParent([config]);
    },

    loadModels: function(config) {
      return this.callParent([config]).then({
        success: function(models) {
          var pis = [];

          _.each(models, function (model) {
            var typePath = model.typePath.toLowerCase();

            if (model.isPortfolioItem()) {
              Rally.data.wsapi.TreeStore.expandedCollectionNames[typePath] = ['Children'];
              Rally.data.wsapi.TreeStore.childToParentTypeMap[typePath] = ['Parent'];
              pis[model.ordinal] = model;

              if (model.isLowestLevelPortfolioItem()) {
                Rally.data.wsapi.TreeStore.expandedCollectionNames[typePath] = ['UserStories'];
                Rally.data.wsapi.TreeStore.parentChildTypeMap[typePath] = [{ typePath: 'hierarchicalrequirement', collectionName: 'UserStories' }];
              }
            }
          });

          _.each(pis, function (model) {
            if (!model) { return; }
            var typePath = model.typePath.toLowerCase();
            var pm = pis[model.ordinal + 1];

            if (pm) {
              Rally.data.wsapi.TreeStore.parentChildTypeMap[pm.typePath.toLowerCase()] = [{ typePath: typePath, collectionName: 'Children' }];
            }
          });

          return this._setupTreeModel(this._getComponentModels(models), config);
        },
        scope: this
      });
    },

    _getComponentModels: function(models) {
      return _.reduce(models, function(result, model) {
        if(_.isFunction(model.getArtifactComponentModels)) {
          return result.concat(model.getArtifactComponentModels());
        } else {
          return result.concat(model);
        }
      }, []);
    },

    _setupTreeModel: function(models, config) {
      var modelsToLoad = [];

      config.parentTypes = this._getParentTypes(models, config);
      if(config.enableHierarchy) {
        modelsToLoad = _.filter(this._getChildModelsToLoad(config), function (m) { return m !== undefined; });
      }

      if (modelsToLoad.length > 0) {
        return this._loadChildModels(modelsToLoad, models, config);
      }

      return Deft.Promise.when(models);
    },

    _getChildModelsToLoad: function(config) {
      return _.difference(Rally.data.wsapi.TreeStore.getChildModelTypePaths(config.parentTypes), config.parentTypes);
      //return [];
    },

    _loadChildModels: function(modelsToLoad, loadedModels, config) {
      return Rally.data.ModelFactory.getModels({
        context: config.context,
        types: modelsToLoad,
        requester: config.requester || this
      }).then({
        success: function(newModels) {
          return _.union(loadedModels, _.values(newModels));
        }
      });
    },

    _getParentTypes: function(models, config) {
      var parentTypes = _.pluck(models, 'typePath');

      if (config.enableHierarchy) {
        parentTypes = _.filter(parentTypes, Rally.data.wsapi.TreeStore.isParentType, Rally.data.wsapi.TreeStore);
      }

      return parentTypes;
    }
  });
})();
