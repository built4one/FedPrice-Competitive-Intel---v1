const { z } = require('zod');
const responseSchema = z.object({
  totalRecords: z.number().default(0),
  opportunitiesData: z.array(z.object({
    noticeId: z.string().nullish(), title: z.string().nullish(), solicitationNumber: z.string().nullish(),
    department: z.string().nullish(), subTier: z.string().nullish(), postedDate: z.string().nullish(),
    type: z.string().nullish(), naicsCode: z.string().nullish(),
    resourceLinks: z.array(z.union([
      z.string(),
      z.object({
        type: z.string().nullish(),
        name: z.string().nullish(),
        link: z.string().nullish()
      }).passthrough()
    ])).nullish()
  }).passthrough()).default([]),
}).passthrough();
