(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Rally.apps.releasetracking.statsbanner.popover.LateStories', {
      alias: 'widget.latestoriespopover',
      extend: 'Rally.ui.popover.Popover',

      constructor: function (config) {
        config.items = [
          {
            xtype: 'rallygrid',
            model: 'User Story',
            headerCls: 'leftright-header-text',
            columnCfgs: ['FormattedID', 'Name', 'Feature', 'Plan Estimate', 'Iteration', 'Release', 'Project', 'Owner'],
            pagingToolbarCfg: {
              pageSizes: [5, 10, 15]
            },
            store: config.store
          }
        ];

        this.callParent(arguments);
      }
    });
    /**
     * shows defects active for timebox
     */
    Ext.define('Rally.apps.releasetracking.statsbanner.LateStories', {
        extend: 'Rally.apps.releasetracking.statsbanner.BannerWidget',
        alias:'widget.statsbannerlatestories',
        requires: [],

        config: {
            context: null,
            store: null,
            data: {
                activeCount: 0
            }
        },

        tpl: [
            '<div class="expanded-widget">',
            '<span style="cursor: pointer">',
            '<div class="stat-title">Late Stories</div>',
            '<div class="stat-metric late">',
            '<div class="metric-icon icon-story"></div>{activeCount}',
            '<div class="stat-secondary">Late</div>',
            '</span>',
            '</div>',
            '</div>',
            '<div class="collapsed-widget">',
            '<span class="metric-icon icon-story"></span>',
            '<div class="stat-title">Late Stories</div>',
            '<div class="stat-metric">{activeCount}</div>',
            '</div>'
        ],

        initComponent: function() {
            this.mon(this.store, 'datachanged', this.onDataChanged, this);
            this.on('render', function () {
              this.getEl().on('click', function () {
                this._onClickLateStories();
              }, this);
            }, this);
            this.callParent(arguments);
        },

        onDataChanged: function() {
            this.update(this._getRenderData());
            this.fireEvent('ready', this);
        },

        _getLateStoriesCount: function() {
            var lateStories = 0;
            _.each(this.store.getRange(), function(record){
              lateStories += record.get('LateChildCount');
            }, this);
            return lateStories;
        },

        _getRenderData: function() {
            return {activeCount: this._getLateStoriesCount()};
        },

        _onClickLateStories: function() {
          var record = this.store.getAt(0);
          //record = _(this.store.getRange()).filter(function (r) { return r.data.UserStories !== ''; }).first();

          var
            filters = this._filterPopover(record.data),
            target = this.getEl();
            //targetSelector = this.targetSelector;
            //
          var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            fetch: ['FormattedID', 'Name', 'Feature', 'Release', 'Iteration', 'Project', 'Owner'],
            filters: filters,
            autoLoad: true,
            pageSize: 5
          });

          var reloadStoreCallback;
          Ext.create('Rally.apps.releasetracking.statsbanner.popover.LateStories', {
            target: target,
            autoShow: false,
            record: record,
            //filters: filters,
            store: store,
            title: 'User Stories Assigned to Later Releases or Iteration',
            width: 800
          }).show();
        },

        _filterPopover: function(record) {
          return [
            {
              property: 'Feature.Release.Name',
              operator: '=',
              value: record.Release.Name
            },
            {
              property: 'DirectChildrenCount',
              operator: '=',
              value: 0
            },
            Rally.data.wsapi.Filter.or([
              {
                property: 'Iteration.EndDate',
                operator: '>',
                value: record.Release.ReleaseDate
              },
              {
                property: 'Release.ReleaseDate',
                operator: '>',
                value: record.Release.ReleaseDate
              }
            ])
          ];
        }
    });
})();
