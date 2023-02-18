export const JSON_SCHEMA = {
  type: ['object', 'array', 'null'],
  nullable: true,
  items: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        nullable: true
      },
      reponse: {
        type: ['object', 'array', 'string', 'number', 'null'],
        nullable: true
      },
      retourHttp: {
        type: 'number',
      },
      erreur: {
        type: ['object']
      },
    },
    required: ['key', 'retourHttp'],
  },
};
