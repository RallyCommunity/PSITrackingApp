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
      'Rally.ui.gridboard.plugin.GridBoardFieldPicker',
      'Rally.ui.cardboard.plugin.ColumnPolicy',
      'Rally.ui.gridboard.plugin.GridBoardFilterInfo',
      'Rally.ui.gridboard.plugin.GridBoardToggleable',
      'Rally.ui.grid.plugin.TreeGridExpandedRowPersistence',
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

    onScopeChange: function() {
      if(!this.rendered) {
        this.on('afterrender', this.onScopeChange, this, {single: true});
        return;
      }

      if (this.down('#statsBanner')) {
        this.down('#statsBanner').destroy();
      }
      if (this.down('#gridBoard')) {
        this.down('#gridBoard').destroy();
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
          this.piTypes = Ext.Array.from(_.first(records).get('TypePath'));

          this._addStatsBanner();
          this._getGridStore().then({
            success: function(gridStore) {
              var model = gridStore.model;
              this._addGridBoard(gridStore);
            },
            scope: this
          });
        }
      });

    },

    _getModelNames: function () {
      return this.piTypes;
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

      return Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(config).then({
        success: function (store) {
          return store;
        }
      });
    },

    _addStatsBanner: function() {
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

      this.gridboard = this.add({
        itemId: 'gridBoard',
        xtype: 'rallygridboard',
        stateId: 'portfoliotracking-gridboard',
        context: context,
        plugins: this._getGridBoardPlugins(),
        modelNames: this._getModelNames(),
        gridConfig: this._getGridConfig(gridStore),
        cardBoardConfig: this._getBoardConfig(),
        storeConfig: {
            filters: [context.getTimeboxScope().getQueryFilter()]
        },
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

      plugins.push('rallygridboardtoggleable');
      var alwaysSelectedValues = ['FormattedID', 'Name', 'Owner'];
      if (context.getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled) {
        alwaysSelectedValues.push('DragAndDropRank');
      }

      var whiteListFields = ['Milestones', 'Tags'];
      plugins.push({
          ptype: 'rallygridboardinlinefiltercontrol',
          inlineFilterButtonConfig: {
            stateful: true,
            stateId: context.getScopedStateId('filters'),
            modelNames: this._getModelNames(),
            inlineFilterPanelConfig: {
              quickFilterPanelConfig: {
                defaultFields: [
                  'ArtifactSearch',
                  'Owner',
                  'ModelType'
                ],
                addQuickFilterConfig: {
                  whiteListFields: whiteListFields
              }
            },
            advancedFilterPanelConfig: {
              advancedFilterRowsConfig: {
                  propertyFieldConfig: {
                      whiteListFields: whiteListFields
                  }
              }
            }
          }
        }
      });

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
        modelNames: this._getModelNames()
      });

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

    _getBoardConfig: function() {
      return {
        attribute: 'State',
        columConfig: {
          fields: (this.getSetting('cardFields') && this.getSetting('cardFields').split(',')) ||
            ['Tasks', 'Defects', 'Discussion', 'PlanEstimate', 'Iteration']
        }
      };
    },

    _getGridConfig: function (gridStore) {
      var context = this.getContext(),
      stateString = 'release-tracking',
      stateId = context.getScopedStateId(stateString);

      var gridConfig = {
        xtype: 'rallytreegrid',
        store: gridStore,
        columnCfgs: this._getGridColumns(),
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
