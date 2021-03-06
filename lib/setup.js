import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { ReactiveObserver } from './ReactiveObserver';

// TODO: can this be imported with an import statement?
const { TemplateInstance } = Blaze;

// Generate a unique key for every request
// If a template does the same request twice, it will query only once
// For now a JSON stringify seems good enough
function generateRequestKey(request) {
  return JSON.stringify(request);
}

function initTemplateQueries(template) {
  if (!template._gqlQueries) {
    // eslint-disable-next-line no-param-reassign
    template._gqlQueries = {};
    // eslint-disable-next-line no-param-reassign
    template._gqlQueriesDep = new Tracker.Dependency();

    template.view.onViewDestroyed(() => {
      Object.keys(template._gqlQueries).forEach(key => template._gqlQueries[key].unsubscribe());
    });
  }
}

export function setup({ client } = {}) {
  TemplateInstance.prototype.gqlQuery = function gqlQuery(request, { equals } = {}) {
    initTemplateQueries(this);

    const key = generateRequestKey(request);

    if (!this._gqlQueries[key]) {
      this._gqlQueries[key] = new ReactiveObserver(client.watchQuery(request), {
        equals,
      });
      this._gqlQueriesDep.changed();
    }

    return this._gqlQueries[key];
  };

  TemplateInstance.prototype.queriesReady = function queriesReady() {
    initTemplateQueries(this);

    this._gqlQueriesDep.depend();

    return Object.keys(this._gqlQueries).every(key => this._gqlQueries[key].isReady());
  };

  TemplateInstance.prototype.gqlSubscribe = function gqlSubscribe(request) {
    initTemplateQueries(this);

    const result = new ReactiveObserver(client.subscribe(request), {
      equals() { return false; },
    });

    result._isReady.set(true);

    const key = result._subscription._networkSubscriptionId;

    this._gqlQueries[key] = result;

    return result;
  };

  TemplateInstance.prototype.gqlMutate = function gqlMutate(request) {
    return client.mutate(request);
  };

  Template.registerHelper('queriesReady', () => Template.instance().queriesReady());
}

export function breakdown() {
  delete TemplateInstance.prototype.gqlQuery;
  delete TemplateInstance.prototype.gqlMutate;
  delete TemplateInstance.prototype.gqlSubscribe;
  delete TemplateInstance.prototype.queriesReady;

  Template.deregisterHelper('queriesReady');
}
