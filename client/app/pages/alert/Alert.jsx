import React from 'react';
import PropTypes from 'prop-types';
import { react2angular } from 'react2angular';
import { head, includes, toString } from 'lodash';

import { $route } from '@/services/ng';
import { currentUser } from '@/services/auth';
import { Query } from '@/services/query';
import navigateTo from '@/services/navigateTo';
import notification from '@/services/notification';
import { Alert as AlertService } from '@/services/alert';

import { QuerySelector } from '@/components/QuerySelector';
import { HelpTrigger } from '@/components/HelpTrigger';
import { SchedulePhrase } from '@/components/queries/SchedulePhrase';
import { PageHeader } from '@/components/PageHeader';
import AlertDestinations from '@/components/alerts/AlertDestinations';

import Form from 'antd/lib/form';
import InputNumber from 'antd/lib/input-number';
import Button from 'antd/lib/button';
import Tooltip from 'antd/lib/tooltip';
import Icon from 'antd/lib/icon';
import Select from 'antd/lib/select';
import Modal from 'antd/lib/modal';

import { STATE_CLASS } from '../alerts/AlertsList';

const NEW_ALERT_ID = 'new';

function isNewAlert() {
  return $route.current.params.alertId === NEW_ALERT_ID;
}

function WarningIcon() {
  return <Icon type="warning" theme="filled" style={{ color: '#ff4d4f' }} />;
}

function Criteria({ columnNames, resultValues, alertOptions, onChange }) {
  if (!alertOptions || !columnNames) {
    return null;
  }

  const columnValue = resultValues && head(resultValues)[alertOptions.column];
  const isColumnValueInValid = columnValue && isNaN(columnValue);
  const columnHint = (
    <small>
      Top row value is <code>{toString(columnValue) || 'unknown'}</code>
      {isColumnValueInValid && (
      <>
        <br /><WarningIcon /> Invalid value type.
      </>
      )}
    </small>
  );

  return (
    <HorizontalFormItem
      label="Trigger when"
      className="alert-trigger"
      help={columnHint}
    >
      <div className="input-title">
        <span>Value column</span>
        <Select
          value={alertOptions.column}
          onChange={column => onChange({ column })}
          dropdownMatchSelectWidth={false}
          style={{ minWidth: 100 }}
        >
          {columnNames.map(name => (
            <Select.Option key={name}>{name}</Select.Option>
          ))}
        </Select>
      </div>
      <div className="input-title">
        <span>Condition</span>
        <Select
          value={alertOptions.op}
          onChange={op => onChange({ op })}
          optionLabelProp="label"
          dropdownMatchSelectWidth={false}
          style={{ width: 55 }}
          id="condition"
        >
          <Select.Option value="greater than" label=">">
          &gt; greater than
          </Select.Option>
          <Select.Option value="less than" label="<">
          &lt; less than
          </Select.Option>
          <Select.Option value="equals" label="=">
          = equals
          </Select.Option>
        </Select>
      </div>
      <div className="input-title">
        <span>Threshold</span>
        <InputNumber value={alertOptions.value} onChange={value => onChange({ value })} />
      </div>
    </HorizontalFormItem>
  );
}

function QueryFormItem({ query, onChange }) {
  const link = query ? (
    <Tooltip title="Open query in a new tab.">
      {' '}
      <a href={`/queries/${query.id}`} target="_blank">
        <i className="fa fa-external-link" />
      </a>
    </Tooltip>
  ) : null;

  const queryHint = query && query.schedule ? (
    <small>
      Scheduled to refresh <SchedulePhrase isLink schedule={query.schedule} isNew={false} />
    </small>
  ) : (
    <small>
      <WarningIcon /> This query has no <a href="">refresh schedule</a>.<br />
      <Icon type="question-circle" theme="twoTone" /> <HelpTrigger className="f-12" type="ALERT_SCHEDULE">Learn why</HelpTrigger> it&apos;s recommended.
    </small>
  );

  return (
    <HorizontalFormItem
      label={<>Query{link}</>}
      help={query && queryHint}
    >
      <QuerySelector
        onChange={onChange}
        selectedQuery={query}
        className="alert-query-selector"
        type="select"
      />
    </HorizontalFormItem>
  );
}

QueryFormItem.propTypes = {
  query: PropTypes.object, // eslint-disable-line react/forbid-prop-types
  onChange: PropTypes.func.isRequired,
};

QueryFormItem.defaultProps = {
  query: null,
};

function HorizontalFormItem({ children, ...props }) {
  return (
    <Form.Item labelCol={{ span: 4 }} wrapperCol={{ span: 12 }} {...props}>
      { children }
    </Form.Item>
  );
}

HorizontalFormItem.propTypes = {
  children: PropTypes.node,
};

HorizontalFormItem.defaultProps = {
  children: null,
};

function AlertState({ state }) {
  return (
    <span className={`alert-state label ${STATE_CLASS[state]}`}>Status: {state}</span>
  );
}

class AlertPage extends React.Component {
  state = {
    alert: null,
    query: null,
    queryResult: null,
    editable: false,
  }

  componentDidMount() {
    if (isNewAlert()) {
      this.setState({
        alert: new AlertService({ options: {} }),
        editable: true,
      });
    } else {
      const { alertId } = $route.current.params;
      AlertService.get({ id: alertId }).$promise.then((alert) => {
        this.setState({
          alert,
          editable: currentUser.canEdit(alert),
        });
        this.onQuerySelected(alert.query);
      });
    }
  }

  getDefaultName = () => 'New Alert';

  onQuerySelected = (query) => {
    this.setState({
      alert: Object.assign(this.state.alert, { query }),
      query,
      queryResult: null,
    });

    // get cached result for column names and values
    new Query(query).getQueryResultPromise().then((queryResult) => {
      this.setState({ queryResult });
      let { column } = this.state.alert.options;
      const columns = queryResult.getColumnNames();

      // default to first column name if none chosen, or irrelevant in current query
      if (!column || !includes(columns, column)) {
        column = head(queryResult.getColumnNames());
      }
      this.setAlertOptions({ column });
    });
  }

  onRearmChange = (rearm) => {
    const { alert } = this.state;
    this.setState({
      alert: Object.assign(alert, { rearm }),
    });
  }

  setAlertOptions = (obj) => {
    const { alert } = this.state;
    const options = { ...alert.options, ...obj };
    this.setState({
      alert: Object.assign(alert, { options }),
    });
  }

  save = () => {
    const { alert } = this.state;

    if (alert.name === undefined || alert.name === '') {
      alert.name = this.getDefaultName();
    }
    if (!alert.rearm) {
      alert.rearm = null;
    }

    alert.$save().then(() => {
      if (isNewAlert()) {
        notification.success('Saved new Alert.');
        navigateTo(`/alerts/${alert.id}`, true);
      } else {
        notification.success('Saved.');
      }
    }).catch(() => {
      notification.error('Failed saving alert.');
    });
  };

  delete = () => {
    const { alert } = this.state;

    const doDelete = () => {
      alert.$delete(() => {
        notification.success('Alert deleted successfully.');
        navigateTo('/alerts', true);
      }, () => {
        notification.error('Failed deleting alert.');
      });
    };

    Modal.confirm({
      title: 'Delete Alert',
      content: 'Are you sure you want to delete this alert?',
      okText: 'Delete',
      okType: 'danger',
      onOk: doDelete,
      maskClosable: true,
      autoFocusButton: null,
    });
  }

  render() {
    if (!this.state.alert) {
      return <div>loading</div>;
    }

    const { alert: { rearm, query, name, options, state, id }, queryResult } = this.state;
    const resultValues = queryResult && queryResult.getData();
    const columnNames = queryResult && queryResult.getColumnNames();

    return (
      <div className="container">
        <PageHeader title={name || this.getDefaultName()}>
          <AlertState state={state} />
        </PageHeader>
        <div className="container">
          <div className="row bg-white tiled p-10">
            <div className="col-md-8">
              <h4>Criteria</h4>
              <Form>
                <QueryFormItem query={query} onChange={this.onQuerySelected} />
                {query && (
                  <>
                    <Criteria
                      onChange={this.setAlertOptions}
                      columnNames={columnNames}
                      resultValues={resultValues}
                      alertOptions={options}
                    />
                    <HorizontalFormItem label="Send notification">
                      <Select className="alert-notification" value={rearm || 0} dropdownMatchSelectWidth={false} onChange={this.onRearmChange}>
                        <Select.Option value={0}>Just once</Select.Option>
                        <Select.Option value={1}>
                          Each time results are refreshed
                        </Select.Option>
                        <Select.Option value={1800}>At most every 30 minutes</Select.Option>
                        <Select.Option value={3600}>At most once an hour</Select.Option>
                        <Select.Option value={86400}>At most once a day</Select.Option>
                        <Select.Option value={604800}>At most once a week</Select.Option>
                      </Select>
                    </HorizontalFormItem>
                    <HorizontalFormItem>
                      <Button type="primary" onClick={this.save}>Save</Button>{' '}
                      <Button type="danger" onClick={this.delete}>Delete Alert</Button>
                    </HorizontalFormItem>
                  </>
                )}
              </Form>
            </div>
            <div className="col-md-4">
              <h4>Destinations{' '}
                <Tooltip title="Open Alert Destination page in a new tab.">
                  <a href="/destinations" target="_blank">
                    <i className="fa fa-external-link" />
                  </a>
                </Tooltip>
              </h4>
              <AlertDestinations alertId={id} />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default function init(ngModule) {
  ngModule.component('alertPage', react2angular(AlertPage));

  return {
    '/alerts/:alertId': {
      template: '<alert-page></alert-page>',
      title: 'Alerts',
    },
  };
}

init.init = true;