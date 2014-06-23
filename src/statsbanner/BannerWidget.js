(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * Abstract class to handle expanding / collapsing for banner widgets
     */
    Ext.define('Rally.apps.releasetracking.statsbanner.BannerWidget', {
        extend: 'Ext.Component',
        alias: 'widget.bannerwidget',

        config: {
            expanded: true
        },

        cls: 'stat-panel',

        data: {},

        tpl: [
            '<div class="expanded-widget"></div>',
            '<div class="collapsed-widget"></div>'
        ],

        onRender: function() {
            if (this.expanded) {
                this.removeCls('collapsed');
            } else {
                this.addCls('collapsed');
            }
            this.callParent(arguments);
        },

        expand: function() {
            this.removeCls('collapsed');
            this.setExpanded(true);
        },

        collapse: function() {
            this.addCls('collapsed');
            this.setExpanded(false);
        }
    });
})();
