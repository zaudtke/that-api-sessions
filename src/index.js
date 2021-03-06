/* eslint-disable import/prefer-default-export */
import 'dotenv/config';
import connect from 'express';
import debug from 'debug';
import { Firestore } from '@google-cloud/firestore';
import { Client as Postmark } from 'postmark';
import responseTime from 'response-time';
import { v4 as uuidv4 } from 'uuid';
import * as Sentry from '@sentry/node';

import apolloGraphServer from './graphql';
import envConfig from './envConfig';
import userEventEmitter from './events/user';
// import { version } from '../package.json';

let version;
(async () => {
  let p;
  try {
    p = await import('./package.json');
  } catch {
    p = await import('../package.json');
  }
  version = p.version;
})();

const firestore = new Firestore();
const dlog = debug('that:api:sessions:index');
const api = connect();
const defaultVersion = `that-api-sessions@${version}`;

const postmark = new Postmark(envConfig.postmarkApiToken);
const userEvents = userEventEmitter(postmark);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.THAT_ENVIRONMENT,
  debug: process.env.NODE_ENV === 'development',
  release: process.env.SENTRY_VERSION || defaultVersion,
});

Sentry.configureScope(scope => {
  scope.setTag('thatApp', 'that-api-sessions');
});

const createConfig = () => ({
  dataSources: {
    sentry: Sentry,
    firestore,
    postmark,
    events: {
      userEvents,
    },
  },
});

const graphServer = apolloGraphServer(createConfig());

const useSentry = async (req, res, next) => {
  Sentry.addBreadcrumb({
    category: 'root',
    message: 'init',
    level: Sentry.Severity.Info,
  });

  next();
};

/**
 * http middleware function
 * here we are intercepting the http call and building our own notion of a users context.
 * we then add it to the request so it can later be used by the gateway.
 * If you had something like a token that needs to be passed through to the gateways children this is how you intercept it and setup for later.
 *
 * @param {string} req - http request
 * @param {string} res - http response
 * @param {string} next - next function to execute
 *
 */
const createUserContext = (req, res, next) => {
  dlog('creating user context');

  const enableMocking = () => {
    if (
      !req.headers['that-enable-mocks'] ||
      req.headers['that-enable-mocks'] === 'undefined'
    )
      return false;

    dlog('mocking enabled');

    const headerValues = req.headers['that-enable-mocks'].split(',');
    const mocks = headerValues.map(i => i.trim().toUpperCase());

    return mocks.includes('SESSIONS');
  };

  const correlationId =
    req.headers['that-correlation-id'] &&
    req.headers['that-correlation-id'] !== 'undefined'
      ? req.headers['that-correlation-id']
      : uuidv4();

  Sentry.configureScope(scope => {
    scope.setTag('correlationId', correlationId);
  });

  let site;
  if (req.headers['that-site']) {
    site = req.headers['that-site'];
  } else if (req.headers['x-forwarded-for']) {
    // eslint-disable-next-line no-useless-escape
    const rxHost = /^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i;
    const refererHost = req.headers['x-forwarded-for'];
    const host = refererHost.match(rxHost);
    // eslint-disable-next-line prefer-destructuring
    if (host) site = host[1];
  } else {
    site = 'www.thatconference.com';
  }

  req.userContext = {
    authToken: req.headers.authorization,
    correlationId,
    enableMocking: enableMocking(),
    site,
  };
  dlog('headers %O', req.headers);
  dlog('userContext %O', req.userContext);

  next();
};

function failure(err, req, res, next) {
  dlog('error %o', err);
  Sentry.captureException(err);

  res
    .set('Content-Type', 'application/json')
    .status(500)
    .json(err);
}

api
  .use(responseTime())
  .use(useSentry)
  .use(createUserContext)
  .use(failure);

graphServer.applyMiddleware({ app: api, path: '/' });

// const port = process.env.PORT || 8003;
// api.listen({ port }, () => dlog(`sessions running on port %d`, port));

export const handler = api;
