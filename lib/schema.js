// Collection validators and indexes. Validators require the core fields and
// allow extra ones (additionalProperties is left open), because datasets come in
// different shapes. ensureSchema() is safe to run any number of times.

const nullable = (bsonType) => ({ bsonType: [].concat(bsonType, 'null') });
const number = ['int', 'long', 'double', 'decimal'];

export const validators = {
  datapoints: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['metric', 'value', 'unit', 'year', 'source', 'verified', 'pipelineStage'],
      properties: {
        metric: { bsonType: 'string', minLength: 1 },
        value: nullable(number),
        unit: nullable('string'),
        year: nullable(number),
        source: {
          bsonType: 'object',
          required: ['title', 'publisher', 'url'],
          properties: {
            title: nullable('string'),
            publisher: nullable('string'),
            url: nullable('string'),
          },
        },
        verified: { bsonType: 'bool' },
        pipelineStage: { bsonType: ['int', 'null'], minimum: 1, maximum: 6 },
        group: { bsonType: 'object' },
        geography: {
          bsonType: 'object',
          properties: {
            level: { enum: ['national', 'state', 'district', 'school', 'institution'] },
            state: nullable('string'),
            district: nullable('string'),
          },
        },
        notes: nullable('string'),
        tags: { bsonType: 'array', items: { bsonType: 'string' } },
      },
      // A verified figure must be a real, dated number with a source link.
      // Unverified placeholders may leave value and year empty.
      oneOf: [
        { properties: { verified: { enum: [false] } } },
        {
          properties: {
            verified: { enum: [true] },
            year: { bsonType: number },
            source: { bsonType: 'object', properties: { url: { bsonType: 'string' } } },
          },
        },
      ],
    },
  },

  sources: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['key', 'apa', 'type', 'url', 'pages'],
      properties: {
        key: { bsonType: 'string', minLength: 1 },
        apa: { bsonType: 'string', minLength: 10 },
        type: { enum: ['primary', 'secondary'] },
        url: nullable('string'),
        pages: { bsonType: 'array', items: { bsonType: 'string' } },
      },
    },
  },

  // Fields beyond these are defined in milestone M3. The core rules here come
  // from CLAUDE.md: everything starts pending, publishing needs consent, and
  // a contact email is optional and private.
  educatorSubmissions: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['status', 'createdAt', 'consentToPublish', 'state'],
      properties: {
        status: { enum: ['pending', 'approved', 'rejected'] },
        createdAt: { bsonType: 'date' },
        consentToPublish: { bsonType: 'bool' },
        state: { bsonType: 'string', minLength: 2, maxLength: 2 },
        contactEmail: nullable('string'),
      },
    },
  },

  // Fields beyond these are defined in milestone M4.
  outreachPrograms: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['status', 'createdAt', 'consentToPublish', 'state'],
      properties: {
        status: { enum: ['pending', 'approved', 'rejected'] },
        createdAt: { bsonType: 'date' },
        consentToPublish: { bsonType: 'bool' },
        state: { bsonType: 'string', minLength: 2, maxLength: 2 },
        contactEmail: nullable('string'),
      },
    },
  },
};

export const indexes = {
  datapoints: [
    { key: { pipelineStage: 1, year: -1 }, name: 'stage_year' },
    { key: { 'geography.state': 1 }, name: 'state' },
    { key: { 'group.label': 1 }, name: 'group_label' },
    // Seeding upserts on this pair, so running the seed twice never duplicates.
    { key: { sourceFile: 1, recordId: 1 }, name: 'seed_key', unique: true },
  ],
  sources: [{ key: { key: 1 }, name: 'source_key', unique: true }],
  educatorSubmissions: [
    { key: { status: 1, createdAt: -1 }, name: 'status_createdAt' },
    { key: { state: 1 }, name: 'state' },
  ],
  outreachPrograms: [
    { key: { status: 1, createdAt: -1 }, name: 'status_createdAt' },
    { key: { state: 1 }, name: 'state' },
  ],
};

export async function ensureSchema(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, validator] of Object.entries(validators)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    }
    for (const { key, ...options } of indexes[name]) {
      await db.collection(name).createIndex(key, options);
    }
  }
}
