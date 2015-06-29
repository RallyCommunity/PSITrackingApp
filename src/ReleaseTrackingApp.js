(function () {
  var Ext = window.Ext4 || window.Ext;

  /**
   * Iteration Tracking Board App
   * The Iteration Tracking Board can be used to visualize and manage your User Stories and Defects within an Iteration.
   */
  Ext.define('Rally.apps.releasetracking.ReleaseTrackingApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    requires: [
      'Rally.data.Ranker',
      'Rally.ui.gridboard.GridBoard',
      'Rally.ui.grid.TreeGrid',
      'Rally.data.wsapi.TreeStoreBuilder',
      'Rally.ui.cardboard.plugin.FixedHeader',
      'Rally.ui.cardboard.plugin.Print',
      'Rally.ui.gridboard.plugin.GridBoardAddNew',
      'Rally.ui.gridboard.plugin.GridBoardOwnerFilter',
      'Rally.ui.gridboard.plugin.GridBoardFilterInfo',
      'Rally.ui.gridboard.plugin.GridBoardArtifactTypeChooser',
      'Rally.ui.gridboard.plugin.GridBoardFieldPicker',
      'Rally.ui.cardboard.plugin.ColumnPolicy',
      'Rally.ui.gridboard.plugin.GridBoardFilterInfo',
      'Rally.ui.gridboard.plugin.GridBoardFilterControl',
      'Rally.ui.gridboard.plugin.GridBoardToggleable',
      'Rally.ui.grid.plugin.TreeGridExpandedRowPersistence',
      'Rally.ui.gridboard.plugin.GridBoardExpandAll',
      'Rally.ui.gridboard.plugin.GridBoardCustomView',
      'Rally.ui.filter.view.ModelFilter',
      'Rally.ui.filter.view.OwnerFilter',
      'Rally.ui.filter.view.OwnerPillFilter',
      'Rally.ui.filter.view.TagPillFilter',
      'Rally.app.Message',
      'Rally.clientmetrics.ClientMetricsRecordable',
      'Rally.apps.releasetracking.StatsBanner'
    ],

    mixins: [
      'Rally.app.CardFieldSelectable',
      'Rally.clientmetrics.ClientMetricsRecordable'
    ],
    componentCls: 'iterationtrackingboard',
    alias: 'widget.rallyreleasetrackingapp',

    settingsScope: 'project',
    scopeType: 'release',
    autoScroll: false,

    config: {
      defaultSettings: {
        ignoreProjectScoping: true
      }
    },

    eModelNames: ['User Story', 'Defect', 'Defect Suite', 'Test Set'],
    sModelNames: [],

    onScopeChange: function() {
      if(!this.rendered) {
        this.on('afterrender', this.onScopeChange, this, {single: true});
        return;
      }

      var typeStore = Ext.create('Rally.data.wsapi.Store', {
        autoLoad: false,
        model: 'TypeDefinition',
        sorters: [{
          property: 'Ordinal',
          direction: 'ASC'
        }],
        filters: [{
          property: 'Parent.Name',
          operator: '=',
          value: 'Portfolio Item'
        }, {
          property: 'Creatable',
          operator: '=',
          value: true
        }]
      });

      typeStore.load({
        scope: this,
        callback: function (records) {
          this.sModelNames = Ext.Array.from(_.first(records).get('TypePath'));
          this.sModelMap = _.transform(records, function (acc, rec) { acc[rec.get('TypePath')] = rec; }, {});

          this._addStatsBanner();
          this._getGridStore().then({
            success: function(gridStore) {
              var model = gridStore.model;
              this._addGridBoard(gridStore);
              gridStore.setParentTypes(this.sModelNames);
              gridStore.load();
            },
            scope: this
          });
        }
      });

    },

    _getModelNames: function () {
      return _.union(this.sModelNames, this.eModelNames);
    },

    getSettingsFields: function () {
      var fields = this.callParent(arguments);
      fields.push({
        name: 'ignoreProjectScoping',
        xtype: 'rallycheckboxfield',
        label: 'Show Children in any Project'
      });

      return fields;
    },

    _getGridStore: function() {
      var context = this.getContext(),
      config = {
        models: this._getModelNames(),
        autoLoad: false,
        remoteSort: true,
        root: {expanded: true},
        enableHierarchy: true,
        expandingNodesRespectProjectScoping: !this.getSetting('ignoreProjectScoping')
      };

      config.filters = [context.getTimeboxScope().getQueryFilter()];

      return Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(config).then({
        success: function (store) {
          return store;
        }
      });
    },

    _addStatsBanner: function() {
      this.remove('statsBanner');
      this.add({
        xtype: 'statsbanner',
        itemId: 'statsBanner',
        context: this.getContext(),
        margin: '0 0 5px 0',
        listeners: {
          resize: this._resizeGridBoardToFillSpace,
          scope: this
        }
      });
    },

    _addGridBoard: function (gridStore) {
      var context = this.getContext();

      this.remove('gridBoard');

      this.gridboard = this.add({
        itemId: 'gridBoard',
        xtype: 'rallygridboard',
        stateId: 'portfoliotracking-gridboard',
        context: context,
        plugins: this._getGridBoardPlugins(),
        modelNames: this._getModelNames(),
        gridConfig: this._getGridConfig(gridStore),
        addNewPluginConfig: {
          style: {
            'float': 'left',
            'margin-right': '5px'
          }
        },
        listeners: {
          load: this._onLoad,
          toggle: this._onToggle,
          recordupdate: this._publishContentUpdatedNoDashboardLayout,
          recordcreate: this._publishContentUpdatedNoDashboardLayout,
          afterrender : function() { 
            console.log("afterrender",this);
            this.setWidth(this.getWidth()+1);
            console.log("afterrender",this.getWidth());
            // console.log(this.getGridOrBoard()); //.getView().refresh(true);
          },
          scope: this
        },
        height: Math.max(this.getAvailableGridBoardHeight()-50, 150)
      });
    },

    /**
     * @private
     */
    getAvailableGridBoardHeight: function() {
      var height = this.getHeight();
      if(this.down('#statsBanner').rendered) {
        height -= this.down('#statsBanner').getHeight();
      }
      return height;
    },

    _getGridBoardPlugins: function() {
      var plugins = ['rallygridboardaddnew'],
      context = this.getContext();

      if (context.isFeatureEnabled('EXPAND_ALL_TREE_GRID_CHILDREN')) {
        plugins.push('rallygridboardexpandall');
      }

      if (context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE')) {
        var filterControlConfig = {
          cls: 'small gridboard-filter-control',
          context: context,
          margin: '3 10 3 7',
          stateful: true,
          stateId: context.getScopedStateId('iteration-tracking-filter-button')
        };

        if (context.isFeatureEnabled('USE_CUSTOM_FILTER_POPOVER_ON_ITERATION_TRACKING_APP')) {
          _.merge(filterControlConfig, {
            customFilterPopoverEnabled: true,
            modelNames: this.modelNames
          });
        } else {
          _.merge(filterControlConfig, {
            items: [
              this._createOwnerFilterItem(context),
              this._createTagFilterItem(context),
              this._createModelFilterItem(context)
            ]
          });
        }

        plugins.push({
          ptype: 'rallygridboardfiltercontrol',
          filterControlConfig: filterControlConfig
        });
      } else {
        plugins.push('rallygridboardownerfilter');
      }

      plugins.push('rallygridboardtoggleable');
      var alwaysSelectedValues = ['FormattedID', 'Name', 'Owner'];
      if (context.getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled) {
        alwaysSelectedValues.push('DragAndDropRank');
      }

      if (!context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE')) {
        plugins.push({
          ptype: 'rallygridboardfilterinfo',
          isGloballyScoped: Ext.isEmpty(this.getSetting('project')),
          stateId: 'iteration-tracking-owner-filter-' + this.getAppId()
        });
      }

      plugins.push({
        ptype: 'rallygridboardfieldpicker',
        headerPosition: 'left',
        gridFieldBlackList: [
          'ObjectID',
          'Description',
          'DisplayColor',
          'Notes',
          'Subscription',
          'Workspace',
          'Changesets',
          'RevisionHistory',
          'Children'
        ],
        boardFieldBlackList: [
          'ObjectID',
          'Description',
          'DisplayColor',
          'Notes',
          'Rank',
          'DragAndDropRank',
          'Subscription',
          'Workspace',
          'Changesets',
          'RevisionHistory',
          'PortfolioItemType',
          'StateChangedDate',
          'Children'
        ],
        alwaysSelectedValues: alwaysSelectedValues,
        modelNames: this.modelNames,
        boardFieldDefaults: (this.getSetting('cardFields') && this.getSetting('cardFields').split(',')) ||
          ['Parent', 'Tasks', 'Defects', 'Discussion', 'PlanEstimate', 'Iteration']
      });

      if (context.isFeatureEnabled('ITERATION_TRACKING_CUSTOM_VIEWS')) {
        plugins.push(this._getCustomViewConfig());
      }

      return plugins;
    },

    setHeight: Ext.Function.createBuffered(function() {
      this.superclass.setHeight.apply(this, arguments);
      this._resizeGridBoardToFillSpace();
    }, 100),

    _resizeGridBoardToFillSpace: function() {
      if(this.gridboard) {
        this.gridboard.setHeight(this.getAvailableGridBoardHeight());
      }
    },

    _getCustomViewConfig: function() {
      var customViewConfig = {
        ptype: 'rallygridboardcustomview',
        stateId: 'iteration-tracking-board-app',

        defaultGridViews: [{
          model: ['UserStory', 'Defect', 'DefectSuite'],
          name: 'Defect Status',
          state: {
            cmpState: {
              expandAfterApply: true,
              columns: [
                'Name',
                'State',
                'Discussion',
                'Priority',
                'Severity',
                'FoundIn',
                'FixedIn',
                'Owner'
              ]
            },
            filterState: {
              filter: {
                defectstatusview: {
                  isActiveFilter: false,
                  itemId: 'defectstatusview',
                  queryString: '((Defects.ObjectID != null) OR (Priority != null))'
                }
              }
            }
          }
        }, {
          model: ['UserStory', 'Defect', 'TestSet', 'DefectSuite'],
          name: 'Task Status',
          state: {
            cmpState: {
              expandAfterApply: true,
              columns: [
                'Name',
                'State',
                'PlanEstimate',
                'TaskEstimate',
                'ToDo',
                'Discussions',
                'Owner'
              ]
            },
            filterState: {
              filter: {
                taskstatusview: {
                  isActiveFilter: false,
                  itemId: 'taskstatusview',
                  queryString: '(Tasks.ObjectID != null)'
                }
              }
            }
          }
        }, {
          model: ['UserStory', 'Defect', 'TestSet'],
          name: 'Test Status',
          state: {
            cmpState: {
              expandAfterApply: true,
              columns: [
                'Name',
                'State',
                'Discussions',
                'LastVerdict',
                'LastBuild',
                'LastRun',
                'ActiveDefects',
                'Priority',
                'Owner'
              ]
            },
            filterState: {
              filter: {
                teststatusview: {
                  isActiveFilter: false,
                  itemId: 'teststatusview',
                  queryString: '(TestCases.ObjectID != null)'
                }
              }
            }
          }
        }]
      };

      customViewConfig.defaultBoardViews = _.cloneDeep(customViewConfig.defaultGridViews);
      _.each(customViewConfig.defaultBoardViews, function(view) {
        delete view.state.cmpState;
      });

      return customViewConfig;
    },

    _createOwnerFilterItem: function (context) {
      var isPillPickerEnabled = context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE'),
      projectRef = context.getProjectRef();

      if (isPillPickerEnabled) {
        return {
          xtype: 'rallyownerpillfilter',
          margin: '-15 0 5 0',
          filterChildren: this.getContext().isFeatureEnabled('S58650_ALLOW_WSAPI_TRAVERSAL_FILTER_FOR_MULTIPLE_TYPES'),
          project: projectRef,
          showPills: false,
          showClear: true
        };
      } else {
        return {
          xtype: 'rallyownerfilter',
          margin: '5 0 5 0',
          filterChildren: this.getContext().isFeatureEnabled('S58650_ALLOW_WSAPI_TRAVERSAL_FILTER_FOR_MULTIPLE_TYPES'),
          project: projectRef
        };
      }

    },

    _createTagFilterItem: function (context) {
      var filterUiImprovementsToggleEnabled = context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE');
      return {
        xtype: 'rallytagpillfilter',
        margin: filterUiImprovementsToggleEnabled ? '-15 0 5 0' : '5 0 5 0',
        showPills: filterUiImprovementsToggleEnabled,
        showClear: filterUiImprovementsToggleEnabled,
        remoteFilter: filterUiImprovementsToggleEnabled
      };
    },

    _createModelFilterItem: function (context) {
      return {
        xtype: 'rallymodelfilter',
        models: this.modelNames,
        context: context
      };
    },

    _getGridConfig: function (gridStore) {
      var context = this.getContext(),
      stateString = 'release-tracking',
      stateId = context.getScopedStateId(stateString);

      var gridConfig = {
        xtype: 'rallytreegrid',
        store: gridStore,
        //enableRanking: this.getContext().getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled,
        //enableRanking: false,
        //enableBulkEdit: false,
        //enableEditing: false,
        columnCfgs: null, //must set this to null to offset default behaviors in the gridboard
        defaultColumnCfgs: this._getGridColumns(),
        model: 'UserStory',
        showSummary: true,
        summaryColumns: this._getSummaryColumnConfig(),
        plugins: [],
        stateId: stateId,
        stateful: true
      };

      return gridConfig;
    },

    _getSummaryColumnConfig: function () {
      var taskUnitName = this.getContext().getWorkspace().WorkspaceConfiguration.TaskUnitName,
      planEstimateUnitName = this.getContext().getWorkspace().WorkspaceConfiguration.IterationEstimateUnitName;

      return [
        {
          field: 'AcceptedLeafStoryCount',
          type: 'sum',
          units: 'Total'
        },
        {
          field: 'AcceptedLeafStoryPlanEstimateTotal',
          type: 'sum',
          units: planEstimateUnitName
        },
        {
          field: 'LeafStoryCount',
          type: 'sum',
          units: 'Total'
        },
        {
          field: 'LeafStoryPlanEstimateTotal',
          type: 'sum',
          units: planEstimateUnitName
        },
        {
          field: 'UnEstimatedLeafStoryCount',
          type: 'sum',
          units: 'Total'
        }
      ];
    },

    _getGridColumns: function (columns) {
      var result = ['FormattedID', 'Name', 'PercentDoneByStoryPlanEstimate', 'PreliminaryEstimate', 'ScheduleState', 'PlanEstimate', 'Blocked', 'Iteration', 'Owner', 'Discussion'];

      if (columns) {
        result = columns;
      }
      _.pull(result, 'FormattedID');

      return result;
    },

    _onLoad: function () {
      this._publishContentUpdated();
      this.recordComponentReady();
    },

    _onBoardFilter: function () {
      this.setLoading(true);
    },

    _onBoardFilterComplete: function () {
      this.setLoading(false);
    },

    _onToggle: function (toggleState) {
      var appEl = this.getEl();

      if (toggleState === 'board') {
        appEl.replaceCls('grid-toggled', 'board-toggled');
      } else {
        appEl.replaceCls('board-toggled', 'grid-toggled');
      }
      this._publishContentUpdated();
    },

    _publishContentUpdated: function () {
      this.fireEvent('contentupdated');
    },

    _publishContentUpdatedNoDashboardLayout: function () {
      this.fireEvent('contentupdated', {dashboardLayout: false});
    }
  });
})();
