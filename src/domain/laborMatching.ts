// Role mappings are search aids, not proof of interchangeable qualifications.
// The fallback families below intentionally favor a defensible adjacent public
// benchmark over failing the entire bottom-up model when the solicitation uses
// a bespoke labor title. The GSA adapter preserves the original solicitation
// title and exposes the mapped search family so the analyst can review it.
import type { LaborSignal } from '../types';

const roles: Array<[RegExp, string]> = [
  [/personnel.*security|background.*investigation|security.*(?:clearance|processing|adjudication)/i, 'Personnel Security Specialist'],
  [/conditional access|identity.*(?:entitlement|access)|(?:entitlement|access).*identity/i, 'Cybersecurity Engineer'],
  [/e.?discovery/i, 'Systems Administrator'],
  [/cloud.*(?:admin|analyst)|tenant.*admin/i, 'Cloud Administrator'],
  [/cloud.*architect|solution.*architect/i, 'Cloud Architect'],
  [/cloud/i, 'Cloud Engineer'],
  [/program manager|project manager/i, 'Program Manager'],
  [/network.*(?:engineer|architect)|sd.?wan/i, 'Network Engineer'],
  [/network.*admin/i, 'Network Administrator'],
  [/network.*analyst/i, 'Network Analyst'],
  [/system.*admin|endpoint|desktop/i, 'Systems Administrator'],
  [/system.*engineer/i, 'Systems Engineer'],
  [/information.*security|infrastructure.*security|security.*specialist|cyber|security.*engineer|\bISSO\b|\bISSM\b/i, 'Cybersecurity Engineer'],
  [/software|application developer|full.?stack/i, 'Software Engineer'],
  [/data scientist/i, 'Data Scientist'], [/data engineer/i, 'Data Engineer'],
  [/database/i, 'Database Administrator'], [/technical writer/i, 'Technical Writer'],
  [/financial|budget analyst/i, 'Financial Analyst'], [/business analyst/i, 'Business Analyst'],
  [/records|record management/i, 'Records Manager'], [/service desk|help desk|helpdesk/i, 'Help Desk'],
  [/subject matter expert|\bSME\b/i, 'Subject Matter Expert'],
];
export function laborFamily(value: string): string { return roles.find(([pattern]) => pattern.test(value))?.[1] || value.trim(); }
export function requiresClearance(value?: string) {
  return Boolean(value && !/\b(?:none|no|not required|unclassified|public trust)\b/i.test(value) && /secret|\bTS\b|\bSCI\b|cleared/i.test(value));
}
function grade(value: string) {
  if (/\bsenior\b|\bsr\b|\bprincipal\b|\blead\b|\bSME\b/i.test(value)) return 'senior';
  if (/\bjunior\b|\bjr\b|\bentry\b/i.test(value)) return 'junior';
  return undefined;
}
export function laborRoleMatch(requested: string, candidate: string) {
  // Intelligence-target analysis is a different occupation from enterprise network operations.
  if (/network/i.test(requested) && /target digital|target network|intelligence|SIGINT/i.test(candidate)
    && !/target digital|intelligence|SIGINT/i.test(requested)) return 0;
  const a = laborFamily(requested).toLowerCase(), b = laborFamily(candidate).toLowerCase();
  const targetGrade = grade(requested), sourceGrade = grade(candidate);
  if (targetGrade && sourceGrade && targetGrade !== sourceGrade) return 0;
  if (a !== b) {
    const tokens = a.split(/[^a-z0-9]+/).filter(t => t.length > 2);
    if (!tokens.length || !tokens.every(t => candidate.toLowerCase().includes(t))) return 0;
  }
  return targetGrade && !sourceGrade ? 0.65 : 0.85;
}

export function benchmarkRole(signal: LaborSignal) {
  // Duties can resolve a misleading spreadsheet title, while preserving both source titles.
  if (/background investigations?|personnel security|clearance processing|security adjudication/i.test(signal.duties || '')
    && !/financial|budget/i.test(signal.title)) return 'Personnel Security Specialist';
  return signal.pwsTitle || signal.title;
}

export function roleMappingIssue(signal: LaborSignal): string | undefined {
  const text = `${signal.title} ${signal.pwsTitle || ''} ${signal.titleConflict || ''}`;
  if (signal.titleConflict && /personnel security|background investigations?/i.test(text)
    && /cyber|infrastructure security|information security/i.test(text))
    return 'Personnel/background-investigation security and cybersecurity are different occupations. Resolve the conflicting source role before selecting a rate proxy.';
  return undefined;
}

export function qualificationMatch(signal: LaborSignal, record: {min_years_experience?: string | number | null; worksite?: string | null; education_level?: string | null;}) {
  const years = Number(record.min_years_experience);
  if (signal.minExperienceYears != null && record.min_years_experience != null && Number.isFinite(years)
    && years < signal.minExperienceYears) return false;
  const location = signal.location || '';
  if (/government|customer|on.?site/i.test(location) && /contractor|off.?site/i.test(record.worksite || '')) return false;
  if (/contractor|off.?site/i.test(location) && /government|customer|on.?site/i.test(record.worksite || '')) return false;
  const education=signal.education || '',offeredEducation=record.education_level || '';
  if (/master|\bM\.?S\.?\b/i.test(education) && /bachelor|associate|high school/i.test(offeredEducation) && !/master|doctor|ph\.?d/i.test(offeredEducation)) return false;
  if (/bachelor|\bB\.?S\.?\b/i.test(education) && /associate|high school/i.test(offeredEducation) && !/bachelor|master|doctor|ph\.?d/i.test(offeredEducation)) return false;
  return true;
}
