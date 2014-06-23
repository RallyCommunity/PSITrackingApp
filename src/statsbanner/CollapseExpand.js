(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * shows collapse/expand toggle for stats banner
     */
    Ext.define('Rally.apps.releasetracking.statsbanner.CollapseExpand', {
        extend: 'Rally.apps.releasetracking.statsbanner.BannerWidget',
        alias:'widget.statsbannercollapseexpand',
        requires: [],

        tpl: [
            '<div class="expanded-widget">',
            '<div class="toggle-icon icon-chevron-up"></div>',
            '</div>',
            '<div class="collapsed-widget">',
            '<div class="toggle-icon icon-chevron-down"></div>',
            '</div>'
        ],

        componentCls: 'collapse-expand',

        bubbleEvents: ['collapse', 'expand'],

        afterRender: function() {
            this.callParent(arguments);
            this.getEl().on('click', this._onCollapseExpandClick, this);
            this.fireEvent('ready', this);
        },

        _onCollapseExpandClick: function() {
            if (this.expanded) {
                this.fireEvent('collapse', this);
            } else {
                this.fireEvent('expand', this);
            }
        },

        expand: function() {
            this.callParent(arguments);
            this.doComponentLayout();
        },

        collapse: function() {
            this.callParent(arguments);
            this.doComponentLayout();
        }
    });
})();
