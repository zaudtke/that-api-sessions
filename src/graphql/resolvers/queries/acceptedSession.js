import debug from 'debug';
import favoriteStore from '../../../dataSources/cloudFirestore/favorite';
import favoritedByFunc from '../shared/favoritedBy';

const dlog = debug('that:api:sessions:query:AcceptedSession');

export const fieldResolvers = {
  AcceptedSession: {
    async __resolveReference({ id }, { dataSources: { sessionLoader } }) {
      dlog('resolveReference');

      const session = await sessionLoader.load(id);

      if (
        session.status === 'ACCEPTED' ||
        session.status === 'SCHEDULED' ||
        session.status === 'CANCELLED'
      )
        return session;

      return null;
    },
    speakers: parent => {
      dlog('speakers');

      return parent.speakers.map(s => ({
        __typename: 'PublicProfile',
        id: s,
      }));
    },
    tags: parent => {
      dlog('tags');

      if (!parent.tags) return [];
      return parent.tags;
    },
    favoritedBy: ({ id }, __, { dataSources: { firestore } }) =>
      favoritedByFunc(id, firestore),

    favoriteCount: ({ id }, __, { dataSources: { firestore } }) => {
      dlog('favoriteCount');

      return favoriteStore(firestore).getSessionFavoriteCount(id);
    },
  },
};
