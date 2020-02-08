import debug from 'debug';

import votingStore from '../../../dataSources/cloudFirestore/voting';
import sessionStore from '../../../dataSources/cloudFirestore/session';
import shuffle from '../../../lib/shuffle';

const dlog = debug('that:api:sessions:me');

export const fieldResolvers = {
  VotingQuery: {
    isVotingOpen: ({ isVotingOpen }) => isVotingOpen,
    totalSubmitted: ({ eventId }, _, { dataSources: { firestore } }) => {
      dlog('totalSubmitted');
      return sessionStore(firestore).getTotalSubmittedForEvent(eventId);
    },

    unVoted: async (
      { eventId, isVotingOpen },
      _,
      { dataSources: { firestore }, user },
    ) => {
      dlog('sessions');

      if (!isVotingOpen) {
        throw new Error('Voting is not currently open');
      }

      const sessions = await votingStore(firestore).findUnVoted(eventId, user);

      return shuffle(sessions);
    },

    voted: async (
      { eventId, isVotingOpen },
      _,
      { dataSources: { firestore, sessionLoader }, user },
    ) => {
      dlog('sessions');

      if (!isVotingOpen) {
        throw new Error('Voting is not currently open');
      }

      const results = await votingStore(firestore).findVoted(eventId, user);

      const x = results.map(r => ({
        id: r.sessionId,
        __typename: 'AnonymizedSession',
      }));

      return x.map(s => sessionLoader.load(s.id));
    },
  },
};