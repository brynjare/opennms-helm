import _ from 'lodash';
import $ from 'jquery';
import * as FileExport from 'app/core/utils/file_export';
import {MetricsPanelCtrl} from 'app/plugins/sdk';
import {transformDataToTable} from './transformers';
import {tablePanelEditor} from './editor';
import {columnOptionsTab} from './column_options';
import {TableRenderer} from './renderer';
import {TableModel} from './table_model';
import '../css/styles.css!'
import '../css/ionicons.css!'

class AlarmTableCtrl extends MetricsPanelCtrl {

  constructor($scope, $injector, $rootScope, annotationsSrv, $sanitize, $compile, datasourceSrv) {
    super($scope, $injector);
    this.$rootScope = $rootScope;
    this.annotationsSrv = annotationsSrv;
    this.$sanitize = $sanitize;
    this.$compile = $compile;
    this.datasourceSrv = datasourceSrv;

    let panelDefaults = {
      targets: [{}],
      transform: 'table',
      pageSize: null,
      showHeader: true,
      styles: [
        {
          type: 'date',
          pattern: 'Time',
          alias: 'Time',
          dateFormat: 'YYYY-MM-DD HH:mm:ss',
        },
        {
          unit: 'short',
          type: 'number',
          alias: '',
          decimals: 2,
          colors: ["rgba(245, 54, 54, 0.9)", "rgba(237, 129, 40, 0.89)", "rgba(50, 172, 45, 0.97)"],
          colorMode: null,
          pattern: '/.*/',
          thresholds: [],
        }
      ],
      columns: [],
      scroll: true,
      fontSize: '100%',
      sort: {col: 0, desc: true},
    };

    this.pageIndex = 0;

    if (this.panel.styles === void 0) {
      this.panel.styles = this.panel.columns;
      this.panel.columns = this.panel.fields;
      delete this.panel.columns;
      delete this.panel.fields;
    }

    _.defaults(this.panel, panelDefaults);

    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
    this.events.on('data-snapshot-load', this.onDataReceived.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
  }


  onInitEditMode() {
    this.addEditorTab('Options', tablePanelEditor, 2);
    this.addEditorTab('Column Styles', columnOptionsTab, 3);
  }

  issueQueries(datasource) {
    this.pageIndex = 0;

    if (this.panel.transform === 'annotations') {
      this.setTimeQueryStart();
      return this.annotationsSrv.getAnnotations({dashboard: this.dashboard, panel: this.panel, range: this.range})
        .then(annotations => {
          return {data: annotations};
        });
    }

    return super.issueQueries(datasource);
  }

  onDataError(err) {
    this.dataRaw = [];
    this.render();
  }

  onDataReceived(dataList) {
    this.dataRaw = dataList;
    this.pageIndex = 0;

    // automatically correct transform mode based on data
    if (this.dataRaw && this.dataRaw.length) {
      if (this.dataRaw[0].type === 'table') {
        this.panel.transform = 'table';
      } else {
        if (this.dataRaw[0].type === 'docs') {
          this.panel.transform = 'json';
        } else {
          if (this.panel.transform === 'table' || this.panel.transform === 'json') {
            this.panel.transform = 'timeseries_to_rows';
          }
        }
      }
    }

    this.render();
  }

  render() {
    this.table = transformDataToTable(this.dataRaw, this.panel);
    this.table.sort(this.panel.sort);

    this.renderer = new TableRenderer(this.panel, this.table, this.dashboard.isTimezoneUtc(), this.$sanitize);

    return super.render(this.table);
  }

  toggleColumnSort(col, colIndex) {
    // remove sort flag from current column
    if (this.table.columns[this.panel.sort.col]) {
      this.table.columns[this.panel.sort.col].sort = false;
    }

    if (this.panel.sort.col === colIndex) {
      if (this.panel.sort.desc) {
        this.panel.sort.desc = false;
      } else {
        this.panel.sort.col = null;
      }
    } else {
      this.panel.sort.col = colIndex;
      this.panel.sort.desc = true;
    }
    this.render();
  }

  link(scope, elem, attrs, ctrl) {
    let data;
    let panel = ctrl.panel;
    let pageCount = 0;
    let formaters = [];

    function getTableHeight() {
      let panelHeight = ctrl.height;

      if (pageCount > 1) {
        panelHeight -= 26;
      }

      return (panelHeight - 31) + 'px';
    }

    function appendTableRows(tbodyElem) {
      ctrl.renderer.setTable(data);
      tbodyElem.empty();
      tbodyElem.html(ctrl.renderer.render(ctrl.pageIndex));
      // Compile the HTML generated by the renderer - this is required for the actions dropdown to function
      ctrl.$compile(tbodyElem.contents())(scope);
    }

    function switchPage(e) {
      let el = $(e.currentTarget);
      ctrl.pageIndex = (parseInt(el.text(), 10) - 1);
      renderPanel();
    }

    function appendPaginationControls(footerElem) {
      footerElem.empty();

      let pageSize = panel.pageSize || 100;
      pageCount = Math.ceil(data.rows.length / pageSize);
      if (pageCount === 1) {
        return;
      }

      let startPage = Math.max(ctrl.pageIndex - 3, 0);
      let endPage = Math.min(pageCount, startPage + 9);

      let paginationList = $('<ul></ul>');

      for (let i = startPage; i < endPage; i++) {
        let activeClass = i === ctrl.pageIndex ? 'active' : '';
        let pageLinkElem = $('<li><a class="table-panel-page-link pointer ' + activeClass + '">' + (i + 1) + '</a></li>');
        paginationList.append(pageLinkElem);
      }

      footerElem.append(paginationList);
    }

    function renderPanel() {
      let panelElem = elem.parents('.panel');
      let rootElem = elem.find('.table-panel-scroll');
      let tbodyElem = elem.find('tbody');
      let footerElem = elem.find('.table-panel-footer');

      elem.css({'font-size': panel.fontSize});
      panelElem.addClass('table-panel-wrapper');

      appendTableRows(tbodyElem);
      appendPaginationControls(footerElem);

      rootElem.css({'max-height': panel.scroll ? getTableHeight() : ''});
    }

    elem.on('click', '.table-panel-page-link', switchPage);

    let unbindDestroy = scope.$on('$destroy', function () {
      elem.off('click', '.table-panel-page-link');
      unbindDestroy();
    });

    ctrl.events.on('render', function (renderData) {
      data = renderData || data;
      if (data) {
        renderPanel();
      }
      ctrl.renderingCompleted();
    });
  }

  // Alarm related actions

  performAlarmActionOnDatasource(source, action, alarmId) {
    this.datasourceSrv.get(source).then(ds => {
      if (ds.type.indexOf("fm-ds") < 0) {
        throw {message: 'Only OpenNMS datasources are supported'};
      } else {
        ds[action](alarmId);
      }
    });
  }

  acknowledgeAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'acknowledgeAlarm', alarmId);
  }

  unacknowledgeAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'unacknowledgeAlarm', alarmId);
  }

  clearAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'clearAlarm', alarmId);
  }

  escalateAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'escalateAlarm', alarmId);
  }

  createTicketForAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'createTicketForAlarm', alarmId);
  }

  updateTicketForAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'updateTicketForAlarm', alarmId);
  }

  closeTicketForAlarm(source, alarmId) {
    this.performAlarmActionOnDatasource(source, 'closeTicketForAlarm', alarmId);
  }
}

AlarmTableCtrl.templateUrl = 'panels/alarm-table/module.html';

export {
  AlarmTableCtrl,
  AlarmTableCtrl as PanelCtrl
};
