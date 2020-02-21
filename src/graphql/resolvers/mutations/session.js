/* eslint-disable import/prefer-default-export */
import debug from 'debug';

import sessionStore from '../../../dataSources/cloudFirestore/session';
import memberStore from '../../../dataSources/cloudFirestore/member';

const dlog = debug('that:api:sessions:mutation');

export const fieldResolvers = {
  SessionMutation: {
    update: async (
      { sessionId },
      { session },
      {
        dataSources: {
          firestore,
          logger,
          events: { userEvents },
        },
        user,
      },
    ) => {
      dlog('TCL: events %o', userEvents);
      dlog('SessionMutation:update called');

      // we need the original before we update it.
      const orginalSession = await sessionStore(
        firestore,
        logger,
      ).findMySession({
        user,
        sessionId,
      });

      const [updatedSession, userResults] = await Promise.all([
        sessionStore(firestore, logger).update({
          user,
          sessionId,
          session,
        }),

        memberStore(firestore).find(user.sub),
      ]);

      if (
        orginalSession.status === 'DRAFT' &&
        updatedSession.status === 'SUBMITTED'
      ) {
        userEvents.emit('newSessionCreated', {
          user: userResults,
          session: updatedSession,
        });
      }

      return updatedSession;
    },
    cancel: ({ sessionId }, args, { dataSources: { firestore, logger } }) => {
      dlog('SessionMutation:cancel called');
      throw new Error('not implemented yet');
      // sessionStore(firestore, logger).get(id),
    },
  },
};
