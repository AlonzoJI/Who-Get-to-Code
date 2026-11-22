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

  // "Share from your classroom" (M3). Full field rules live in lib/educator.js;
  // this is the database's backstop. Only consented answers can be approved.
  educatorSubmissions: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'status', 'createdAt', 'consentToPublish', 'state', 'role', 'schoolSector', 'schoolLocale',
        'gradeBands', 'courses', 'shares', 'barriers', 'changedSince2025',
      ],
      properties: {
        status: { enum: ['pending', 'approved', 'rejected'] },
        createdAt: { bsonType: 'date' },
        consentToPublish: { bsonType: 'bool' },
        state: { bsonType: 'string', minLength: 2, maxLength: 2 },
        role: { bsonType: 'string' },
        schoolSector: { bsonType: 'string' },
        schoolLocale: { bsonType: 'string' },
        gradeBands: { bsonType: 'array', minItems: 1, items: { bsonType: 'string' } },
        courses: { bsonType: 'array', minItems: 1, items: { bsonType: 'string' } },
        shares: { bsonType: 'object' },
        barriers: { bsonType: 'array', items: { bsonType: 'string' } },
        changedSince2025: { enum: ['yes', 'no', 'not-sure'] },
        changeDetails: nullable('string'),
        whatWorked: nullable('string'),
        showNameAndSchool: { bsonType: 'bool' },
        contactEmail: nullable('string'),
      },
      oneOf: [
        { properties: { status: { enum: ['pending', 'rejected'] } } },
        { properties: { status: { enum: ['approved'] }, consentToPublish: { enum: [true] } } },
      ],
    },
  },

  // STEM outreach directory (M4). Full field rules live in lib/outreach.js;
  // this is the database's backstop. A listing can only be approved if the
  // program agreed to be listed.
  outreachPrograms: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'status', 'createdAt', 'consentToPublish', 'state', 'programName', 'organization', 'website',
        'gradeBands', 'formats', 'cost', 'howToConnect', 'fundingChange', 'contactEmail',
      ],
      properties: {
        status: { enum: ['pending', 'approved', 'rejected'] },
        createdAt: { bsonType: 'date' },
        approvedAt: nullable('date'),
        consentToPublish: { bsonType: 'bool' },
        state: { bsonType: 'string', minLength: 2, maxLength: 2 },
        programName: { bsonType: 'string', minLength: 1, maxLength: 120 },
        organization: { bsonType: 'string', minLength: 1, maxLength: 120 },
        website: { bsonType: 'string', pattern: '^https?://' },
        gradeBands: { bsonType: 'array', minItems: 1, items: { bsonType: 'string' } },
        formats: { bsonType: 'array', minItems: 1, items: { bsonType: 'string' } },
        cost: { enum: ['free', 'low-cost', 'paid'] },
        scholarships: { bsonType: 'bool' },
        howToConnect: { bsonType: 'string', minLength: 1 },
        fundingChange: { enum: ['yes', 'no', 'not-sure'] },
        fundingDetails: nullable('string'),
        contactName: nullable('string'),
        contactEmail: { bsonType: 'string', minLength: 3 },
      },
      oneOf: [
        { properties: { status: { enum: ['pending', 'rejected'] } } },
        { properties: { status: { enum: ['approved'] }, consentToPublish: { enum: [true] } } },
      ],
    },
  },

  // Submission attempts per hashed visitor (lib/rate-limit.js). Expire after an hour.
  rateLimits: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['key', 'createdAt'],
      properties: { key: { bsonType: 'string' }, createdAt: { bsonType: 'date' } },
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
    { key: { status: 1, approvedAt: -1 }, name: 'status_approvedAt' },
    { key: { state: 1 }, name: 'state' },
  ],
  rateLimits: [
    { key: { key: 1, createdAt: 1 }, name: 'key_createdAt' },
    { key: { createdAt: 1 }, name: 'expire', expireAfterSeconds: 3600 },
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
