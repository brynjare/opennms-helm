import { TableRenderer } from "./renderer"
import md5 from '../../crypto-js/md5';
import {Model} from '../../opennms';

const compareStrings = (a, b) => {
  return (a || b) ? (!a ? -1 : !b ? 1 : a.localeCompare(b)) : 0;
};

export class AlarmDetailsCtrl {

  /** @ngInject */
  constructor($scope, backendSrv, contextSrv, datasourceSrv) {
    this.$scope = $scope;
    this.backendSrv = backendSrv;
    this.contextSrv = contextSrv;
    this.datasourceSrv = datasourceSrv;
    this.editFeedback = false;
    $scope.editor = { index: 0 };

    this.CORRECT_OUTLINED = "/public/plugins/opennms-helm-app/img/if_icon-ios7-checkmark-outline_211714.png";
    this.CORRECT_FILLED = "/public/plugins/opennms-helm-app/img/if_icon-ios7-checkmark_211715.png";

    this.INCORRECT_OUTLINED = "/public/plugins/opennms-helm-app/img/if_icon-close_211652.png";
    this.INCORRECT_FILLED = "/public/plugins/opennms-helm-app/img/if_icon-close-circled_211650.png";

    // Save the alarm
    $scope.alarm = $scope.$parent.alarm;
    $scope.source = $scope.$parent.source;

    if ($scope.alarm.relatedAlarms && $scope.alarm.relatedAlarms.length > 0) {
      const related = {};
      $scope.alarm.relatedAlarms.forEach(alarm => {
        const label = (alarm.nodeLabel === undefined || alarm.nodeLabel === null)? '' : alarm.nodeLabel;
        if (!related[label]) {
          related[label] = [];
        }
        related[label].push(alarm);
      });
      $scope.relatedAlarms = Object.keys(related).sort(compareStrings).map((label) => {
        return {
          label: label,
          alarms: related[label]
        };
      });
    }

    // Feedback Counts
    $scope.feedbackCorrectCount = 0;
    $scope.feedbackIncorrectCount = 0;

    // Compute the icon
    let severity = $scope.alarm.severity.label.toLowerCase();
    $scope.severityIcon = TableRenderer.getIconForSeverity(severity);
    $scope.severity = $scope.$parent.severity;

    // Situation Feedback
    $scope.situationFeebackEnabled = false;
    $scope.feebackButton = this.CORRECT_OUTLINED;

    // Compute the tabs
    $scope.tabs = ['Overview', 'Memos'];
    $scope.ticketingEnabled = $scope.$parent.ticketerConfig && $scope.$parent.ticketerConfig.enabled;
    if ($scope.ticketingEnabled) {
      $scope.tabs.push('Ticketing');
    }
    // If this is a Situation, collect any correlation feedback previously submitted
    if ($scope.alarm.relatedAlarms && $scope.alarm.relatedAlarms.length > 0) {
      $scope.tabs.push('Related Alarms');
      let self = this;
      this.getDatasource().then(ds => { return ds.getSituationFeedback(self.$scope.alarm.id) })
        .then(
          function (feedback) {
            $scope.situationFeedback = self.initalizeFeeback();
            if (feedback && feedback.length > 0) {
              self.updateFeedback(feedback);
              $scope.hasSituationFeedback = true;
            }
            $scope.situationFeedbackButton = self.situationFeedbackButton();
            $scope.situationFeebackEnabled = true;
          })
        .catch(
          function (reason) {
            console.log("Situation Feedback not supported error: ", reason);
          });
    }

    $scope.tabs.push('JSON');
    $scope.getAlarmString = () => {
      return JSON.stringify($scope.alarm, undefined, 2);
    }

    // Raw global details link
    $scope.detailsLink = $scope.alarm.detailsPage.substring(0, $scope.alarm.detailsPage.indexOf("="));
  }

  detailFeedbackIncorrectButton(reductionKey) {
    let button = this.INCORRECT_OUTLINED;
    if (this.$scope.situationFeedback) {
      for (let feedback of this.$scope.situationFeedback) {
        if (feedback.alarmKey === reductionKey && feedback.feedbackType === Model.FeedbackTypes.FALSE_POSITIVE) {
          button = this.INCORRECT_FILLED;
          break;
        }
      }
    }
    return button;
  }

  detailFeedbackOkayButton(reductionKey) {
    let button = this.CORRECT_FILLED;
    if (this.$scope.situationFeedback) {
      for (let feedback of this.$scope.situationFeedback) {
        if (feedback.alarmKey === reductionKey && feedback.feedbackType === Model.FeedbackTypes.FALSE_POSITIVE) {
          button = this.CORRECT_OUTLINED;
          break;
        }
      }
    }
    return button;
  }

  initalizeFeeback() {
    this.$scope.feedbackCorrectCount = 0;
    this.$scope.feedbackIncorrectCount = 0;
    let feedback = [];
    for (let alarm of this.$scope.alarm.relatedAlarms) {
      let alarmFeedback = new Model.OnmsSituationFeedback();
      alarmFeedback.situationKey = this.$scope.alarm.reductionKey;
      alarmFeedback.situationFingerprint = this.fingerPrint(this.$scope.alarm);
      alarmFeedback.alarmKey = alarm.reductionKey;
      alarmFeedback.feedbackType = Model.FeedbackTypes.CORRECT;
      alarmFeedback.reason = "ALL_CORRECT";
      alarmFeedback.user = this.contextSrv.user.login;
      feedback.push(alarmFeedback);
      this.$scope.feedbackCorrectCount++;
    }
    return feedback;
  }

  markIncorrect(reductionKey) {
    for (let feedback of this.$scope.situationFeedback) {
      if (feedback.alarmKey === reductionKey && feedback.feedbackType === Model.FeedbackTypes.CORRECT) {
        feedback.feedbackType = Model.FeedbackTypes.FALSE_POSITIVE;
        this.$scope.feedbackCorrectCount--;
        this.$scope.feedbackIncorrectCount++;
        break;
      }
    }
  }

  markCorrect(reductionKey) {
    for (let feedback of this.$scope.situationFeedback) {
      if (feedback.alarmKey === reductionKey && feedback.feedbackType === Model.FeedbackTypes.FALSE_POSITIVE) {
        feedback.feedbackType = Model.FeedbackTypes.CORRECT;
        this.$scope.feedbackCorrectCount++;
        this.$scope.feedbackIncorrectCount--;
        break;
      }
    }
  }

  submitEditedFeedback(form) {
    for (let feedback of this.$scope.situationFeedback) {
      if (form) {
        feedback.reason = form.reason;
      }
    }
    this.submitFeedback(this.$scope.situationFeedback);
  }

  submitFeedback(feedback) {
    let self = this;
    this.getDatasource().then(ds => { return ds.submitSituationFeedback(self.$scope.alarm.id, feedback) })
      .then(
        function () {
          self.$scope.editFeedback = false;
          self.$scope.submittedFeedback = true;
          self.$scope.hasSituationFeedback = true;
        })
      .catch(
        function (reason) {
          console.log("Got POST error: ", reason);
          self.$scope.editFeedback = false;
        });
  }

  updateFeedback(feedback) {
    for (let fb of feedback) {
      for (let ifb of this.$scope.situationFeedback) {
        if (fb.alarmKey === ifb.alarmKey)
          ifb = fb;
      }
    }
  }

  editSituationFeedback() {
    this.$scope.editFeedback = true;
    this.$scope.submittedFeedback = false;
  }

  situationFeedbackButton() {
    let button = this.CORRECT_OUTLINED;
    let fingerprint = this.fingerPrint(this.$scope.alarm);
    if (this.$scope.situationFeedback) {
      for (let feedback of this.$scope.situationFeedback) {
        if (feedback.situationFingerprint == fingerprint && this.$scope.hasSituationFeedback) {
          button = this.CORRECT_FILLED;
          break;
        }
      }
    }
    return button;
  }

  cancelEditedFeedback() {
    this.$scope.situationFeedback = this.initalizeFeeback();
    this.$scope.editFeedback = false;
    this.$scope.submittedFeedback = false;
  }

  fingerPrint(situation) {
    return btoa(md5(situation.relatedAlarms));
  }

  getDatasource() {
    return this.datasourceSrv.get(this.$scope.source).then(ds => {
      if (ds.type && ds.type.indexOf("fault-datasource") < 0) {
        throw { message: 'Only OpenNMS datasources are supported' };
      } else {
        return ds;
      }
    });
  }
}

/** @ngInject */
export function alarmDetailsAsDirective() {
  'use strict';
  return {
    restrict: 'E',
    templateUrl: 'public/plugins/opennms-helm-app/panels/alarm-table/alarm_details.html',
    controller: AlarmDetailsCtrl,
    bindToController: true,
    controllerAs: 'ctrl',
    scope: { dismiss: "&" }
  };
}
