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
      response: {
        type: ['object', 'array', 'string', 'number', 'null'],
        nullable: true
      },
      httpCode: {
        type: 'number'
      },
      // Condition sur le body de la requête (JSON partiel) : cf. chrome/src/utils/bodyMatch.ts
      bodyMatch: {
        type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
        nullable: true
      },
      erreur: {
        type: ['object']
      }
    },
    required: ['key', 'httpCode']
  }
};
